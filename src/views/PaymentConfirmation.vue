<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'
import { useOrderStore } from '@/stores/order'
import { useRestaurantStore } from '@/stores/restaurant'
import { getCustomerCookie, setCustomerCookie, generateCustomerToken } from '@/utils/cookies'
import api from '@/services/api'

const router = useRouter()
const cart = useCartStore()
const order = useOrderStore()
const restaurantStore = useRestaurantStore()

const paymentMethods = computed(() => restaurantStore.paymentMethods)
const total = computed(() => cart.subtotal + order.deliveryCost)

const customerName = ref(order.customerName)
const customerPhone = ref(order.customerPhone)
const selectedPaymentMethod = ref(null)

const submitting = ref(false)
const submitError = ref(null)

onMounted(() => {
    // Pre-fill from cookie
    const cookie = getCustomerCookie()
    if (cookie) {
        customerName.value = cookie.name ?? ''
        customerPhone.value = cookie.phone ?? ''
    }

    // Auto-select if only one active
    if (paymentMethods.value.length === 1) {
        selectedPaymentMethod.value = paymentMethods.value[0].type
    }
})

function mapsUrl(lat, lng) {
    return `https://maps.google.com/?q=${lat},${lng}`
}

function buildWhatsappMessage(orderId) {
    const typeLabels = { delivery: 'A domicilio', pickup: 'Recoger en local', dine_in: 'Comer en el local' }

    const itemLines = cart.items.map((item) => {
        const mods = item.modifiers.length > 0 ? ` (${item.modifiers.map((m) => m.name).join(', ')})` : ''
        const notes = item.notes ? ` - Nota: ${item.notes}` : ''
        return `• ${item.quantity}x ${item.product_name}${mods}${notes} - $${item.item_total.toFixed(2)}`
    }).join('\n')

    let deliveryLines = ''
    if (order.deliveryType === 'delivery') {
        deliveryLines = `🚗 *Tipo:* A domicilio\n`
            + `📍 *Dirección:* ${order.address}${order.addressReferences ? ' — ' + order.addressReferences : ''}\n`
            + `🏪 *Sucursal:* ${order.branchName}\n`
            + (order.distanceKm ? `📏 Distancia: ${order.distanceKm.toFixed(1)} km\n` : '')
            + (order.latitude && order.longitude ? `📌 Ubicación: ${mapsUrl(order.latitude, order.longitude)}\n` : '')
    } else {
        deliveryLines = `🏪 *Tipo:* ${typeLabels[order.deliveryType]}\n`
            + `📍 *Sucursal:* ${order.branchName}\n`
            + (order.branchAddress ? `🗺️ ${order.branchAddress}\n` : '')
            + (order.branchLatitude && order.branchLongitude ? `📌 Ubicación: ${mapsUrl(order.branchLatitude, order.branchLongitude)}\n` : '')
    }

    const scheduledLine = order.scheduledAt
        ? `🕐 Programado para: ${new Date(order.scheduledAt).toLocaleString('es-MX')}`
        : '🕐 Lo antes posible'

    const paymentLine = { cash: 'Efectivo', terminal: 'Terminal bancaria', transfer: 'Transferencia (SPEI)' }[selectedPaymentMethod.value] ?? selectedPaymentMethod.value

    return encodeURIComponent(
        `*Pedido #${orderId} — GuisoGo*\n\n` +
        `👤 *Cliente:* ${customerName.value} | ${customerPhone.value}\n\n` +
        `🛒 *Pedido:*\n${itemLines}\n\n` +
        `${deliveryLines}` +
        `${scheduledLine}\n` +
        `💳 *Pago:* ${paymentLine}\n\n` +
        `*Subtotal:* $${cart.subtotal.toFixed(2)}\n` +
        `*Envío:* $${order.deliveryCost.toFixed(2)}\n` +
        `*Total: $${total.value.toFixed(2)}*`,
    )
}

async function confirm() {
    if (!customerName.value || !customerPhone.value || !selectedPaymentMethod.value) { return }

    submitting.value = true
    submitError.value = null

    // Open blank window immediately in user-click stack to avoid popup blocker
    const whatsappWin = window.open('', '_blank')

    try {
        // Get or create customer token
        let cookie = getCustomerCookie()
        if (!cookie) {
            cookie = { token: generateCustomerToken() }
        }

        const payload = {
            customer: {
                token: cookie.token,
                name: customerName.value,
                phone: customerPhone.value,
            },
            branch_id: order.branchId,
            delivery_type: order.deliveryType,
            payment_method: selectedPaymentMethod.value,
            address: order.address || null,
            address_references: order.addressReferences || null,
            latitude: order.latitude || null,
            longitude: order.longitude || null,
            distance_km: order.distanceKm || null,
            delivery_cost: order.deliveryCost,
            scheduled_at: order.scheduledAt || null,
            items: cart.items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                notes: item.notes || null,
                modifiers: item.modifiers.map((m) => ({
                    modifier_option_id: m.modifier_option_id,
                    price_adjustment: m.price_adjustment,
                })),
            })),
        }

        const { data } = await api.post('/api/orders', payload)
        const orderId = data.data.order_id
        const whatsapp = data.data.branch_whatsapp

        // Save customer data to cookie
        setCustomerCookie({
            token: cookie.token,
            name: customerName.value,
            phone: customerPhone.value,
            address: order.address,
            address_references: order.addressReferences,
            latitude: order.latitude,
            longitude: order.longitude,
        })

        order.confirmedOrderId = orderId
        order.customerName = customerName.value
        order.customerPhone = customerPhone.value

        // Open WhatsApp — use pre-opened window to avoid popup blocker
        const message = buildWhatsappMessage(orderId)
        if (whatsappWin) {
            whatsappWin.location.href = `https://wa.me/${whatsapp}?text=${message}`
        } else {
            // Popups blocked — redirect current tab as fallback
            window.location.href = `https://wa.me/${whatsapp}?text=${message}`
        }

        order.setOrderSummary(cart.items, cart.subtotal, order.deliveryCost)
        cart.clear()
        router.push('/confirmed')
    } catch (err) {
        // Close the pre-opened blank window on error
        if (whatsappWin) { whatsappWin.close() }
        submitError.value = err.response?.data?.message ?? 'Error al registrar el pedido. Intenta de nuevo.'
    } finally {
        submitting.value = false
    }
}

const selectedPmDetails = computed(() =>
    restaurantStore.paymentMethods.find((pm) => pm.type === selectedPaymentMethod.value),
)
</script>

<template>
    <div class="min-h-dvh bg-[#f6f8f7]">

        <!-- Header -->
        <header class="sticky top-0 z-10 bg-[#f6f8f7] border-b border-gray-100 px-4 py-3">
            <div class="max-w-md mx-auto flex items-center gap-3">
                <button
                    @click="router.back()"
                    class="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-100"
                >
                    <span class="material-symbols-outlined text-gray-600 text-xl">arrow_back</span>
                </button>
                <h1 class="text-base font-bold text-gray-900">Confirmar pedido</h1>
            </div>
        </header>

        <div class="max-w-md mx-auto px-4 py-5 pb-36">

            <!-- Customer data -->
            <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                <h2 class="text-sm font-bold text-gray-900 mb-4">Tus datos</h2>
                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre completo</label>
                        <div class="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
                            <span class="material-symbols-outlined text-gray-400 text-lg">person</span>
                            <input
                                v-model="customerName"
                                type="text"
                                placeholder="Juan Pérez"
                                class="flex-1 bg-transparent text-sm focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Teléfono</label>
                        <div class="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
                            <span class="material-symbols-outlined text-gray-400 text-lg" aria-hidden="true">phone</span>
                            <input
                                v-model="customerPhone"
                                type="tel"
                                inputmode="numeric"
                                pattern="[0-9]{10}"
                                maxlength="10"
                                name="phone"
                                autocomplete="tel-national"
                                placeholder="5512345678"
                                class="flex-1 bg-transparent text-sm focus-visible:outline-none"
                            />
                        </div>
                        <p v-if="customerPhone && !/^\d{10}$/.test(customerPhone)" class="mt-1 text-xs text-red-500">Ingresa 10 dígitos numéricos.</p>
                    </div>
                </div>
            </div>

            <!-- Delivery summary -->
            <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                <h2 class="text-sm font-bold text-gray-900 mb-3">Entrega</h2>
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined text-[#FF5722] text-xl" style="font-variation-settings:'FILL' 1">
                        {{ order.deliveryType === 'delivery' ? 'delivery_dining' : order.deliveryType === 'pickup' ? 'shopping_bag' : 'restaurant' }}
                    </span>
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-medium text-[#FF5722] mb-0.5">
                            {{ order.deliveryType === 'delivery' ? 'A domicilio' : order.deliveryType === 'pickup' ? 'Recoger en local' : 'Comer en el local' }}
                        </p>
                        <p class="text-sm font-semibold text-gray-900">{{ order.branchName }}</p>

                        <!-- Delivery: customer address -->
                        <template v-if="order.deliveryType === 'delivery'">
                            <p v-if="order.address" class="text-xs text-gray-500 mt-0.5">{{ order.address }}</p>
                            <p v-if="order.distanceKm" class="text-xs text-gray-500 mt-0.5">{{ order.distanceKm?.toFixed(1) }} km · ${{ order.deliveryCost.toFixed(2) }} envio</p>
                        </template>

                        <!-- Pickup / Dine in: branch address -->
                        <template v-else>
                            <p v-if="order.branchAddress" class="text-xs text-gray-500 mt-0.5">{{ order.branchAddress }}</p>
                        </template>

                        <p class="text-xs text-gray-400 mt-1">{{ order.scheduledAt ? 'Programado: ' + new Date(order.scheduledAt).toLocaleString('es-MX') : 'Lo antes posible' }}</p>
                    </div>
                </div>
            </div>

            <!-- Payment method -->
            <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                <h2 class="text-sm font-bold text-gray-900 mb-3">Método de pago</h2>

                <div v-if="paymentMethods.length === 0" class="text-sm text-gray-400 text-center py-2">
                    Sin métodos de pago disponibles.
                </div>

                <div class="space-y-2">
                    <button
                        v-for="pm in paymentMethods"
                        :key="pm.type"
                        @click="selectedPaymentMethod = pm.type"
                        class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left"
                        :class="selectedPaymentMethod === pm.type
                            ? 'border-[#FF5722] bg-orange-50'
                            : 'border-gray-100 bg-gray-50'"
                    >
                        <div
                            class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                            :class="selectedPaymentMethod === pm.type ? 'border-[#FF5722] bg-[#FF5722]' : 'border-gray-300'"
                        >
                            <span v-if="selectedPaymentMethod === pm.type" class="material-symbols-outlined text-white text-xs">check</span>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-gray-900">
                                {{ pm.type === 'cash' ? 'Efectivo' : pm.type === 'terminal' ? 'Terminal bancaria' : 'Transferencia (SPEI)' }}
                            </p>
                            <p class="text-xs text-gray-500">
                                {{ pm.type === 'cash' ? 'Pagas al recibir' : pm.type === 'terminal' ? 'Tarjeta débito/crédito' : 'Pago por SPEI' }}
                            </p>
                        </div>
                    </button>
                </div>

                <!-- Transfer bank details -->
                <div
                    v-if="selectedPaymentMethod === 'transfer' && selectedPmDetails"
                    class="mt-4 bg-gray-50 rounded-2xl p-4 text-sm"
                >
                    <p class="font-semibold text-gray-900 mb-2">Datos bancarios</p>
                    <p class="text-gray-600">Banco: <span class="font-medium">{{ selectedPmDetails.bank_name }}</span></p>
                    <p class="text-gray-600">Titular: <span class="font-medium">{{ selectedPmDetails.account_holder }}</span></p>
                    <p class="text-gray-600">CLABE: <span class="font-mono font-medium">{{ selectedPmDetails.clabe }}</span></p>
                </div>
            </div>

            <!-- Order summary -->
            <div class="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                <h2 class="text-sm font-bold text-gray-900 mb-3">Resumen del pedido</h2>

                <div class="space-y-2 mb-3">
                    <div
                        v-for="(item, index) in cart.items"
                        :key="index"
                        class="flex justify-between text-sm"
                    >
                        <div>
                            <span class="text-gray-700">{{ item.quantity }}x {{ item.product_name }}</span>
                            <div v-if="item.modifiers.length > 0" class="text-xs text-gray-400">{{ item.modifiers.map(m => m.name).join(', ') }}</div>
                        </div>
                        <span class="font-medium text-gray-900 shrink-0">${{ item.item_total.toFixed(2) }}</span>
                    </div>
                </div>

                <div class="border-t border-gray-100 pt-3 space-y-1">
                    <div class="flex justify-between text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span>${{ cart.subtotal.toFixed(2) }}</span>
                    </div>
                    <div class="flex justify-between text-sm text-gray-600">
                        <span>Envío</span>
                        <span>${{ order.deliveryCost.toFixed(2) }}</span>
                    </div>
                    <div class="flex justify-between font-bold text-base pt-1">
                        <span>Total</span>
                        <span class="text-[#FF5722]">${{ total.toFixed(2) }}</span>
                    </div>
                </div>
            </div>

            <!-- Error -->
            <div v-if="submitError" class="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 mb-4">
                <div class="flex items-start gap-2">
                    <span class="material-symbols-outlined text-red-500 text-lg shrink-0" style="font-variation-settings:'FILL' 1">error</span>
                    {{ submitError }}
                </div>
            </div>

            <p class="text-xs text-gray-400 text-center px-4">
                Al confirmar, se abrirá WhatsApp con los detalles de tu pedido.
            </p>
        </div>

        <!-- Confirm button -->
        <div class="fixed bottom-5 left-4 right-4 max-w-md mx-auto">
            <button
                @click="confirm"
                :disabled="!customerName || !/^\d{10}$/.test(customerPhone) || !selectedPaymentMethod || submitting"
                class="w-full bg-[#FF5722] text-white rounded-2xl py-4 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-transform disabled:opacity-40"
            >
                <span class="material-symbols-outlined text-xl" style="font-variation-settings:'FILL' 1">send</span>
                {{ submitting ? 'Registrando pedido...' : 'Confirmar y enviar por WhatsApp' }}
            </button>
        </div>
    </div>
</template>
