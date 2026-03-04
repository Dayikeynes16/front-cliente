<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useRestaurantStore } from '@/stores/restaurant'

const restaurantStore = useRestaurantStore()

onMounted(async () => {
    await restaurantStore.fetchRestaurant()
    await restaurantStore.fetchMenu()

    // Request geolocation permission early so the browser prompt appears before checkout
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000 })
    }
})
</script>

<template>
    <div class="min-h-dvh bg-[#f6f8f7]">
        <RouterView />
    </div>
</template>
