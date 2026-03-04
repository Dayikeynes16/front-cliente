<script setup>
import { useRouter } from 'vue-router'
import { useOrderStore } from '@/stores/order'
import { useRestaurantStore } from '@/stores/restaurant'

const router = useRouter()
const order = useOrderStore()
const restaurantStore = useRestaurantStore()

const summary = order.orderSummary

function goBack() {
    order.reset()
    router.push('/')
}

function mapsUrl(lat, lng) {
    return `https://maps.google.com/?q=${lat},${lng}`
}

function resendWhatsapp() {
    if (!order.confirmedOrderId || !order.branchWhatsapp || !summary) return

    const typeLabels = { delivery: 'A domicilio', pickup: 'Recoger en local', dine_in: 'Comer en el local' }
    const paymentLabels = { cash: 'Efectivo', terminal: 'Terminal bancaria', transfer: 'Transferencia (SPEI)' }

    const itemLines = summary.items.map((item) => {
        const mods = item.modifiers?.length > 0 ? ` (${item.modifiers.map((m) => m.name).join(', ')})` : ''
        const notes = item.notes ? ` - Nota: ${item.notes}` : ''
        return `• ${item.quantity}x ${item.product_name}${mods}${notes} - $${item.item_total.toFixed(2)}`
    }).join('\n')

    let deliveryLines = ''
    if (order.deliveryType === 'delivery') {
        const fullAddress = `${order.addressStreet} #${order.addressNumber}, Col. ${order.addressColony}`
        deliveryLines = `🚗 *Tipo:* A domicilio\n`
            + `📍 *Dirección:* ${fullAddress}${order.addressReferences ? ' — ' + order.addressReferences : ''}\n`
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

    const paymentLine = paymentLabels[order.paymentMethod] ?? order.paymentMethod

    const message = encodeURIComponent(
        `*Pedido #${order.confirmedOrderId} — GuisoGo*\n\n` +
        `👤 *Cliente:* ${order.customerName} | ${order.customerPhone}\n\n` +
        `🛒 *Pedido:*\n${itemLines}\n\n` +
        `${deliveryLines}` +
        `${scheduledLine}\n` +
        `💳 *Pago:* ${paymentLine}\n\n` +
        `*Subtotal:* $${summary.subtotal.toFixed(2)}\n` +
        `*Envío:* $${summary.deliveryCost.toFixed(2)}\n` +
        `*Total: $${summary.total.toFixed(2)}*`,
    )

    window.open(`https://wa.me/${order.branchWhatsapp}?text=${message}`, '_blank')
}
</script>

<template>
    <div class="min-h-dvh bg-[#f6f8f7] flex flex-col">

        <!-- Header -->
        <header class="flex items-center p-4 pb-2 z-10">
            <button
                @click="goBack"
                class="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
                <span class="material-symbols-outlined text-gray-900 text-2xl">close</span>
            </button>
            <h1 class="text-lg font-bold text-gray-900 tracking-tight flex-1 text-center pr-10">
                {{ restaurantStore.restaurant?.name ?? '' }}
            </h1>
        </header>

        <!-- Main content -->
        <main class="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center gap-8 pb-40">

            <!-- Success icon + text -->
            <div class="flex flex-col items-center gap-6 mt-8">
                <div class="w-32 h-32 rounded-full bg-[#FF5722]/20 flex items-center justify-center animate-pulse">
                    <div class="w-24 h-24 rounded-full bg-[#FF5722] flex items-center justify-center shadow-lg shadow-[#FF5722]/40">
                        <span class="material-symbols-outlined text-white !text-[64px]">check</span>
                    </div>
                </div>
                <div class="flex flex-col items-center gap-2 text-center">
                    <h2 class="text-3xl font-bold tracking-tight text-gray-900">Pedido enviado</h2>
                    <p class="text-gray-500 text-base leading-relaxed max-w-[280px]">
                        Recibirás la confirmación y detalles de tu orden por WhatsApp.
                    </p>
                </div>
            </div>

            <!-- Order ID badge -->
            <div
                v-if="order.confirmedOrderId"
                class="inline-flex items-center justify-center h-10 px-6 rounded-full bg-[#FF5722]/10 border border-[#FF5722]/20"
            >
                <span class="text-[#FF5722] font-bold text-lg tracking-wide">#{{ order.confirmedOrderId }}</span>
            </div>

            <!-- Order summary card -->
            <div v-if="summary" class="w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <!-- Gradient header -->
                <div class="relative h-32 w-full bg-gradient-to-r from-[#FF5722] to-[#D84315]">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                    <div class="absolute bottom-3 left-4 right-4">
                        <p class="text-white font-bold text-lg">Resumen del pedido</p>
                    </div>
                </div>

                <!-- Items -->
                <div class="p-4 flex flex-col gap-3 border-b border-gray-100">
                    <div
                        v-for="(item, index) in summary.items"
                        :key="index"
                        class="flex justify-between items-start"
                    >
                        <div class="flex gap-3">
                            <span class="bg-gray-100 text-gray-600 font-bold text-xs h-6 w-6 rounded flex items-center justify-center mt-0.5">
                                {{ item.quantity }}
                            </span>
                            <div class="flex flex-col">
                                <p class="text-sm font-medium text-gray-900">{{ item.product_name }}</p>
                                <p
                                    v-if="item.modifiers && item.modifiers.length > 0"
                                    class="text-xs text-gray-500"
                                >{{ item.modifiers.map(m => m.name).join(', ') }}</p>
                            </div>
                        </div>
                        <p class="text-sm font-medium text-gray-900">${{ item.item_total.toFixed(2) }}</p>
                    </div>
                </div>

                <!-- Totals -->
                <div class="p-4 bg-gray-50">
                    <div class="flex justify-between items-center mb-1">
                        <p class="text-gray-500 text-sm">Subtotal</p>
                        <p class="text-gray-900 text-sm font-medium">${{ summary.subtotal.toFixed(2) }}</p>
                    </div>
                    <div class="flex justify-between items-center mb-3">
                        <p class="text-gray-500 text-sm">Envío</p>
                        <p class="text-gray-900 text-sm font-medium">${{ summary.deliveryCost.toFixed(2) }}</p>
                    </div>
                    <div class="flex justify-between items-center border-t border-gray-200 pt-3">
                        <p class="text-[#FF5722] font-bold text-base">Total</p>
                        <p class="text-gray-900 font-bold text-xl">${{ summary.total.toFixed(2) }} MXN</p>
                    </div>
                </div>
            </div>
        </main>

        <!-- Footer -->
        <footer class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-6 flex flex-col gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] rounded-t-xl z-20">
            <div class="max-w-md mx-auto w-full flex flex-col gap-3">
                <button
                    v-if="order.branchWhatsapp && order.confirmedOrderId"
                    @click="resendWhatsapp"
                    class="w-full h-12 rounded-full bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold text-base tracking-wide shadow-lg shadow-[#25D366]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    <span class="material-symbols-outlined text-xl">chat</span>
                    Reenviar por WhatsApp
                </button>
                <button
                    @click="goBack"
                    class="w-full h-12 rounded-full bg-[#FF5722] hover:bg-[#e64a19] text-white font-bold text-base tracking-wide shadow-lg shadow-[#FF5722]/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    Volver al menú
                </button>
            </div>
        </footer>
    </div>
</template>
