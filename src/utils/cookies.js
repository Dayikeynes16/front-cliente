const COOKIE_NAME = 'guisogo_customer'
const EXPIRY_DAYS = 90

export function getCustomerCookie() {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
    if (!match) { return null }
    try {
        return JSON.parse(decodeURIComponent(match[1]))
    } catch {
        return null
    }
}

export function setCustomerCookie(data) {
    const expires = new Date()
    expires.setDate(expires.getDate() + EXPIRY_DAYS)
    const value = encodeURIComponent(JSON.stringify(data))
    document.cookie = `${COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

export function generateCustomerToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 1
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
