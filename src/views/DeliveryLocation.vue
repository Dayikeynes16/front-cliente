<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRestaurantStore } from '@/stores/restaurant'
import { useCartStore } from '@/stores/cart'
import { useOrderStore } from '@/stores/order'
import { getCustomerCookie } from '@/utils/cookies'
import api from '@/services/api'
import MapPicker from '@/components/MapPicker.vue'

const router = useRouter()
const restaurantStore = useRestaurantStore()
const cart = useCartStore()
const order = useOrderStore()

const restaurant = computed(() => restaurantStore.restaurant)

// Active delivery type — only show what the restaurant allows
const activeTypes = computed(() => {
    const r = restaurant.value
    if (!r) { return [] }
    const types = []
    if (r.allows_delivery) { types.push('delivery') }
    if (r.allows_pickup) { types.push('pickup') }
    if (r.allows_dine_in) { types.push('dine_in') }
    return types
})

const selectedType = ref(null)

// Set default type once restaurant data is available (may load async)
watch(activeTypes, (types) => {
    if (types.length && !selectedType.value) {
        selectedType.value = types[0]
        if (types[0] === 'delivery') {
            requestGps()
        }
    }
}, { immediate: true })

onMounted(() => {
    // Pre-fill from cookie
    const cookie = getCustomerCookie()
    if (cookie) {
        addressStreet.value = cookie.address_street ?? ''
        addressNumber.value = cookie.address_number ?? ''
        addressColony.value = cookie.address_colony ?? ''
        addressReferences.value = cookie.address_references ?? ''
    }
})

// Delivery fields
const addressStreet = ref('')
const addressNumber = ref('')
const addressColony = ref('')
const addressReferences = ref('')
const latitude = ref(null)
const longitude = ref(null)
const scheduledAt = ref(null)

// State
const proceeding = ref(false)
const deliveryError = ref(null)

// GPS
const locating = ref(false)
const gpsError = ref(null)
const gpsResolved = ref(false)
async function requestGps() {
    if (!navigator.geolocation) {
        gpsError.value = 'Tu navegador no soporta geolocalización.'
        gpsResolved.value = true
        return
    }
    locating.value = true
    gpsError.value = null
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            latitude.value = pos.coords.latitude
            longitude.value = pos.coords.longitude
            locating.value = false
            gpsResolved.value = true
            gpsError.value = null
        },
        (err) => {
            locating.value = false
            gpsResolved.value = true
            if (err.code === 1) {
                gpsError.value = 'Permiso de ubicación denegado. Actívalo en los ajustes de tu navegador o arrastra el pin en el mapa.'
            } else if (err.code === 2) {
                gpsError.value = 'No se pudo obtener tu ubicación. Intenta de nuevo o arrastra el pin en el mapa.'
            } else {
                gpsError.value = 'Tiempo de espera agotado. Intenta de nuevo o arrastra el pin en el mapa.'
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
}

async function proceed() {
    if (selectedType.value === 'delivery') {
        if (!addressStreet.value || !addressNumber.value || !addressColony.value || !latitude.value || !longitude.value) { return }

        proceeding.value = true
        deliveryError.value = null

        try {
            const { data } = await api.post('/api/delivery/calculate', {
                latitude: latitude.value,
                longitude: longitude.value,
            })
            const result = data.data

            if (!result.is_in_coverage) {
                deliveryError.value = `Tu ubicación está a ${result.distance_km} km, fuera del área de cobertura.`
                proceeding.value = false
                return
            }

            order.setDelivery('delivery', result, {
                distance_km: result.distance_km,
                delivery_cost: result.delivery_cost,
                address_street: addressStreet.value,
                address_number: addressNumber.value,
                address_colony: addressColony.value,
                address_references: addressReferences.value,
                latitude: latitude.value,
                longitude: longitude.value,
            })
        } catch (err) {
            deliveryError.value = err.response?.data?.message ?? 'No hay cobertura en tu zona.'
            proceeding.value = false
            return
        }

        proceeding.value = false
    } else if (selectedType.value === 'pickup' || selectedType.value === 'dine_in') {
        if (!selectedBranch.value) { return }
        order.setDelivery(selectedType.value, selectedBranch.value, { delivery_cost: 0 })
    }
    order.scheduledAt = scheduledAt.value
    router.push('/payment')
}

// Pickup / dine_in branch selection
const branches = computed(() => restaurantStore.restaurant?.branches ?? [])
const selectedBranch = ref(null)

onMounted(() => {
    if (branches.value.length === 1) {
        selectedBranch.value = branches.value[0]
    }
})

const typeLabels = {
    delivery: { icon: 'delivery_dining', label: 'A domicilio' },
    pickup: { icon: 'shopping_bag', label: 'Recoger' },
    dine_in: { icon: 'restaurant', label: 'Comer aqui' },
}

const showSchedule = ref(false)

const timeSlots = computed(() => {
    const now = new Date()
    const today = now.getDay() // 0=Sun..6=Sat

    // Use restaurant-level schedules
    const schedules = restaurant.value?.schedules ?? []
    const schedule = schedules.find((s) => s.day_of_week === today)

    let openHour = 8, openMin = 0, closeHour = 22, closeMin = 0
    if (schedule && !schedule.is_closed && schedule.opens_at && schedule.closes_at) {
        const [oh, om] = schedule.opens_at.split(':').map(Number)
        const [ch, cm] = schedule.closes_at.split(':').map(Number)
        openHour = oh; openMin = om; closeHour = ch; closeMin = cm
    }

    // Start from next 30-min mark at least 30 min from now
    const start = new Date(now)
    start.setMinutes(start.getMinutes() + 30)
    // Round up to next 30-min
    const mins = start.getMinutes()
    start.setMinutes(mins <= 30 ? 30 : 60, 0, 0)
    if (mins > 30) { start.setHours(start.getHours()) }

    // If start is before opening, jump to opening
    const openTime = new Date(now)
    openTime.setHours(openHour, openMin, 0, 0)
    if (start < openTime) { start.setTime(openTime.getTime()) }

    // Close time
    const close = new Date(now)
    close.setHours(closeHour, closeMin, 0, 0)

    const slots = []
    const cursor = new Date(start)
    while (cursor < close) {
        const h = cursor.getHours()
        const m = cursor.getMinutes()
        const label = `${h}:${String(m).padStart(2, '0')}`
        const pad = (n) => String(n).padStart(2, '0')
        const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}T${pad(h)}:${pad(m)}`
        slots.push({ label, value: iso })
        cursor.setMinutes(cursor.getMinutes() + 30)
    }
    return slots
})
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
                <h1 class="text-base font-bold text-gray-900">Como recibes tu pedido?</h1>
            </div>
        </header>

        <div class="max-w-md mx-auto px-4 py-5 pb-36">

            <!-- Delivery type selector -->
            <div class="flex gap-2 mb-6">
                <button
                    v-for="type in activeTypes"
                    :key="type"
                    @click="selectedType = type; deliveryError = null"
                    class="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border transition-all text-sm font-medium"
                    :class="selectedType === type
                        ? 'bg-[#FF5722]/10 border-[#FF5722] text-[#FF5722]'
                        : 'bg-white border-gray-100 text-gray-600'"
                >
                    <span
                        class="material-symbols-outlined text-2xl"
                        :style="selectedType === type ? 'font-variation-settings:\'FILL\' 1' : ''"
                    >{{ typeLabels[type]?.icon }}</span>
                    {{ typeLabels[type]?.label }}
                </button>
            </div>

            <!-- Delivery: address form -->
            <template v-if="selectedType === 'delivery'">

                <!-- GPS button -->
                <button
                    @click="requestGps"
                    class="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3 mb-3 text-sm font-medium text-gray-700"
                    :class="{ 'opacity-60': locating }"
                >
                    <span class="material-symbols-outlined text-[#FF5722] text-xl" style="font-variation-settings:'FILL' 1">my_location</span>
                    <span>{{ locating ? 'Obteniendo ubicacion...' : latitude ? 'Ubicacion obtenida' : 'Usar mi ubicacion actual' }}</span>
                </button>

                <!-- GPS error -->
                <div v-if="gpsError" class="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700 mb-3">
                    <div class="flex items-start gap-2">
                        <span class="material-symbols-outlined text-amber-500 text-lg shrink-0">warning</span>
                        {{ gpsError }}
                    </div>
                </div>

                <!-- Interactive map (renders after GPS resolves) -->
                <div class="mb-4">
                    <div v-if="!gpsResolved" class="w-full h-56 rounded-2xl bg-gray-100 flex flex-col items-center justify-center">
                        <div class="w-8 h-8 rounded-full border-4 border-gray-200 border-t-[#FF5722] animate-spin mb-2"></div>
                        <p class="text-xs text-gray-500">Obteniendo tu ubicación...</p>
                    </div>
                    <MapPicker
                        v-else
                        :lat="latitude"
                        :lng="longitude"
                        @update:lat="val => latitude = val"
                        @update:lng="val => longitude = val"
                    />
                </div>

                <!-- Address fields -->
                <div class="space-y-3 mb-4">
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Calle</label>
                        <input
                            v-model="addressStreet"
                            type="text"
                            maxlength="255"
                            placeholder="Av. Alvaro Obregon"
                            class="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5722]/30"
                        />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Numero exterior</label>
                        <input
                            v-model="addressNumber"
                            type="text"
                            maxlength="50"
                            placeholder="154"
                            class="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5722]/30"
                        />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Colonia</label>
                        <input
                            v-model="addressColony"
                            type="text"
                            maxlength="255"
                            placeholder="Roma Norte"
                            class="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5722]/30"
                        />
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Referencias</label>
                        <textarea
                            v-model="addressReferences"
                            placeholder="Entre calles, color de casa, numero de depto..."
                            rows="2"
                            class="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#FF5722]/30"
                        ></textarea>
                    </div>
                </div>

                <!-- Error -->
                <div v-if="deliveryError" class="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 mb-4">
                    <div class="flex items-start gap-2">
                        <span class="material-symbols-outlined text-red-500 text-lg shrink-0" style="font-variation-settings:'FILL' 1">error</span>
                        {{ deliveryError }}
                    </div>
                </div>
            </template>

            <!-- Pickup / Dine in: branch selection -->
            <template v-if="selectedType === 'pickup' || selectedType === 'dine_in'">
                <div v-if="branches.length === 0" class="text-center py-8 text-sm text-gray-400">
                    Sin sucursales disponibles.
                </div>
                <div v-else class="space-y-3 mb-4">
                    <button
                        v-for="branch in branches"
                        :key="branch.id"
                        @click="selectedBranch = branch"
                        class="w-full bg-white rounded-2xl border p-4 text-left transition-all"
                        :class="selectedBranch?.id === branch.id
                            ? 'border-[#FF5722] bg-orange-50'
                            : 'border-gray-100'"
                    >
                        <div class="flex items-start gap-3">
                            <div
                                class="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0"
                                :class="selectedBranch?.id === branch.id ? 'border-[#FF5722] bg-[#FF5722]' : 'border-gray-300'"
                            >
                                <span v-if="selectedBranch?.id === branch.id" class="material-symbols-outlined text-white text-xs">check</span>
                            </div>
                            <div>
                                <p class="font-semibold text-gray-900 text-sm">{{ branch.name }}</p>
                                <p class="text-xs text-gray-500 mt-0.5">{{ branch.address }}</p>
                            </div>
                        </div>
                    </button>
                </div>
            </template>

            <!-- Scheduled time -->
            <div class="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
                <p class="text-sm font-semibold text-gray-900 mb-3">Para cuando?</p>
                <div class="flex gap-2 mb-1">
                    <button
                        @click="scheduledAt = null; showSchedule = false"
                        class="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all"
                        :class="!scheduledAt ? 'bg-[#FF5722]/10 border-[#FF5722] text-[#FF5722]' : 'border-gray-100 text-gray-600'"
                    >
                        Lo antes posible
                    </button>
                    <button
                        @click="showSchedule = true; if (!scheduledAt && timeSlots.length) scheduledAt = timeSlots[0].value"
                        class="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all"
                        :class="showSchedule ? 'bg-[#FF5722]/10 border-[#FF5722] text-[#FF5722]' : 'border-gray-100 text-gray-600'"
                    >
                        Programar
                    </button>
                </div>

                <!-- Time slot chips -->
                <div v-if="showSchedule" class="mt-3">
                    <p class="text-xs text-gray-400 mb-2">Hoy</p>
                    <div v-if="timeSlots.length" class="flex flex-wrap gap-2">
                        <button
                            v-for="slot in timeSlots"
                            :key="slot.value"
                            @click="scheduledAt = slot.value"
                            class="px-4 py-2 rounded-full text-sm font-medium border transition-all"
                            :class="scheduledAt === slot.value
                                ? 'bg-[#FF5722] text-white border-[#FF5722] shadow-md shadow-orange-200'
                                : 'bg-gray-50 text-gray-700 border-gray-200'"
                        >
                            {{ slot.label }}
                        </button>
                    </div>
                    <p v-else class="text-xs text-gray-400 text-center py-3">Sin horarios disponibles para hoy.</p>
                </div>
            </div>
        </div>

        <!-- Continue button -->
        <div class="fixed bottom-5 left-4 right-4 max-w-md mx-auto">
            <button
                @click="proceed"
                :disabled="proceeding || (selectedType === 'delivery' && (!addressStreet || !addressNumber || !addressColony || !latitude || !longitude)) || ((selectedType === 'pickup' || selectedType === 'dine_in') && !selectedBranch)"
                class="w-full bg-[#FF5722] text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-transform disabled:opacity-40"
            >
                {{ proceeding ? 'Verificando cobertura...' : 'Continuar al pago' }}
            </button>
        </div>
    </div>
</template>
