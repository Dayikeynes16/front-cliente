import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'guisogo_order'

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch { return {} }
}

export const useOrderStore = defineStore('order', () => {
    const saved = loadFromStorage()

    const deliveryType = ref(saved.deliveryType ?? null)
    const branchId = ref(saved.branchId ?? null)
    const branchName = ref(saved.branchName ?? null)
    const branchWhatsapp = ref(saved.branchWhatsapp ?? null)
    const branchAddress = ref(saved.branchAddress ?? '')
    const branchLatitude = ref(saved.branchLatitude ?? null)
    const branchLongitude = ref(saved.branchLongitude ?? null)
    const distanceKm = ref(saved.distanceKm ?? null)
    const deliveryCost = ref(saved.deliveryCost ?? 0)
    const addressStreet = ref(saved.addressStreet ?? '')
    const addressNumber = ref(saved.addressNumber ?? '')
    const addressColony = ref(saved.addressColony ?? '')
    const addressReferences = ref(saved.addressReferences ?? '')
    const latitude = ref(saved.latitude ?? null)
    const longitude = ref(saved.longitude ?? null)
    const scheduledAt = ref(saved.scheduledAt ?? null)
    const paymentMethod = ref(saved.paymentMethod ?? null)
    const customerName = ref(saved.customerName ?? '')
    const customerPhone = ref(saved.customerPhone ?? '')
    const confirmedOrderId = ref(saved.confirmedOrderId ?? null)
    const orderSummary = ref(saved.orderSummary ?? null)

    watch([
        deliveryType, branchId, branchName, branchWhatsapp, branchAddress,
        branchLatitude, branchLongitude, distanceKm, deliveryCost,
        addressStreet, addressNumber, addressColony, addressReferences, latitude, longitude,
        scheduledAt, paymentMethod, customerName, customerPhone,
        confirmedOrderId, orderSummary,
    ], () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            deliveryType: deliveryType.value,
            branchId: branchId.value,
            branchName: branchName.value,
            branchWhatsapp: branchWhatsapp.value,
            branchAddress: branchAddress.value,
            branchLatitude: branchLatitude.value,
            branchLongitude: branchLongitude.value,
            distanceKm: distanceKm.value,
            deliveryCost: deliveryCost.value,
            addressStreet: addressStreet.value,
            addressNumber: addressNumber.value,
            addressColony: addressColony.value,
            addressReferences: addressReferences.value,
            latitude: latitude.value,
            longitude: longitude.value,
            scheduledAt: scheduledAt.value,
            paymentMethod: paymentMethod.value,
            customerName: customerName.value,
            customerPhone: customerPhone.value,
            confirmedOrderId: confirmedOrderId.value,
            orderSummary: orderSummary.value,
        }))
    }, { deep: true })

    function setDelivery(type, branch, deliveryData = {}) {
        deliveryType.value = type
        branchId.value = branch.id ?? branch.branch_id
        branchName.value = branch.name ?? branch.branch_name
        branchWhatsapp.value = branch.whatsapp ?? branch.branch_whatsapp
        branchAddress.value = branch.address ?? ''
        branchLatitude.value = branch.latitude ?? null
        branchLongitude.value = branch.longitude ?? null
        distanceKm.value = deliveryData.distance_km ?? null
        deliveryCost.value = deliveryData.delivery_cost ?? 0
        addressStreet.value = deliveryData.address_street ?? ''
        addressNumber.value = deliveryData.address_number ?? ''
        addressColony.value = deliveryData.address_colony ?? ''
        addressReferences.value = deliveryData.address_references ?? ''
        latitude.value = deliveryData.latitude ?? null
        longitude.value = deliveryData.longitude ?? null
    }

    function setOrderSummary(cartItems, subtotal, deliveryCostVal) {
        orderSummary.value = {
            items: JSON.parse(JSON.stringify(cartItems)),
            subtotal,
            deliveryCost: deliveryCostVal,
            total: subtotal + deliveryCostVal,
        }
    }

    function reset() {
        deliveryType.value = null
        branchId.value = null
        branchName.value = null
        branchWhatsapp.value = null
        branchAddress.value = ''
        branchLatitude.value = null
        branchLongitude.value = null
        distanceKm.value = null
        deliveryCost.value = 0
        addressStreet.value = ''
        addressNumber.value = ''
        addressColony.value = ''
        addressReferences.value = ''
        latitude.value = null
        longitude.value = null
        scheduledAt.value = null
        paymentMethod.value = null
        confirmedOrderId.value = null
        orderSummary.value = null
        localStorage.removeItem(STORAGE_KEY)
    }

    return {
        deliveryType, branchId, branchName, branchWhatsapp,
        branchAddress, branchLatitude, branchLongitude, distanceKm,
        deliveryCost, addressStreet, addressNumber, addressColony, addressReferences, latitude, longitude,
        scheduledAt, paymentMethod, customerName, customerPhone, confirmedOrderId,
        orderSummary,
        setDelivery, setOrderSummary, reset,
    }
})
