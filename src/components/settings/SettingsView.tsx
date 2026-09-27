import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Camera,
  Check,
  Lock,
  Mail,
  MapPin,
  Package,
  Palette,
  Phone,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Store,
} from 'lucide-react'
import { useProductStore, useSettingsStore, type StoreSettings } from '../../store/store'
import { applyThemeColor, DEFAULT_THEME_COLOR } from '../../lib/theme'
import { resizeImageToDataUrl } from '../../lib/imageResize'
import { BRAND_ICON } from '../../lib/brand'
import { ChangePasswordModal } from './ChangePasswordModal'

const SHADE_OPTIONS: Array<{ name: string; hex: string }> = [
  { name: 'Current App Green', hex: DEFAULT_THEME_COLOR },
  { name: 'Classic Bottle', hex: '#1B3A2B' },
  { name: 'British Racing', hex: '#01411C' },
  { name: 'Deep Emerald', hex: '#1E4D3A' },
  { name: 'Rich Forest', hex: '#14432A' },
  { name: 'Charcoal Green', hex: '#263A31' },
  { name: 'Olive Bottle', hex: '#3C4A2E' },
  { name: 'Midnight Pine', hex: '#1A2E22' },
]

const isValidHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value)

const EMPTY_DRAFT: StoreSettings = {
  name: '',
  ownerName: '',
  phone: '',
  shopContactNumber: '',
  email: '',
  address: '',
  businessType: '',
  instagramId: '',
  logoUrl: '',
  gstEnabled: false,
  themeColor: DEFAULT_THEME_COLOR,
  lowStockThreshold: 5,
  expiryAlertDays: 30,
}

function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB]/30 p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h3 className="text-[15px] font-black text-[#111111]">{title}</h3>
          <p className="text-[12px] text-[#6B7280]">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-[#374151] mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-[13px] font-bold text-[#111111] outline-none focus:border-brand-black placeholder:text-gray-400 placeholder:font-medium'

export const SettingsView: React.FC<{ onOpenInventory?: () => void }> = ({ onOpenInventory }) => {
  const { settings, loading, fetchSettings, saveSettings } = useSettingsStore()
  const { products, fetchProducts } = useProductStore()

  const [draft, setDraft] = useState<StoreSettings>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void fetchSettings()
    void fetchProducts()
  }, [fetchSettings, fetchProducts])

  useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  const isDirty = useMemo(() => {
    if (!settings) return false
    return (Object.keys(EMPTY_DRAFT) as Array<keyof StoreSettings>).some((key) => draft[key] !== settings[key])
  }, [draft, settings])

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const previewShade = (hex: string) => {
    set('themeColor', hex)
    applyThemeColor(hex) // live preview across the whole app immediately
  }

  const catalogueSummary = useMemo(() => {
    const active = products.filter((p) => p.isActive !== false)
    const byCategory = new Map<string, number>()
    for (const p of active) {
      const name = (p.category || 'Uncategorized').trim() || 'Uncategorized'
      byCategory.set(name, (byCategory.get(name) || 0) + 1)
    }
    return {
      total: active.length,
      categories: Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [products])

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setStatusMessage({ type: 'error', text: 'Please choose an image file for the logo' })
      return
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      set('logoUrl', dataUrl)
    } catch (err) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not process that image' })
    }
  }

  const handleReset = () => {
    if (settings) setDraft(settings)
    applyThemeColor(settings?.themeColor || DEFAULT_THEME_COLOR)
    setStatusMessage(null)
    setFieldErrors({})
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!draft.ownerName.trim()) errors.ownerName = 'Full name is required'
    if (!draft.name.trim()) errors.name = 'Shop name is required'
    if (!isValidHex(draft.themeColor)) errors.themeColor = 'Enter a valid hex color'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    setStatusMessage(null)
    if (!validate()) {
      setStatusMessage({ type: 'error', text: 'Please fix the highlighted fields before saving.' })
      return
    }
    setSaving(true)
    const result = await saveSettings(draft)
    setSaving(false)
    setStatusMessage(
      result.ok
        ? { type: 'success', text: 'Settings saved.' }
        : { type: 'error', text: result.error || 'Could not save settings. Please try again.' }
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-black text-[#111111] tracking-tight">Store Settings</h2>
          <p className="text-[13px] text-[#6B7280]">Shop profile used across invoices, receipts and the app header.</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E5E7EB] rounded-xl text-[12px] font-bold text-[#374151] hover:bg-[#F9FAFB]"
            >
              <RefreshCw size={13} /> Reset
            </button>
          )}
          <button
            type="button"
            disabled={saving || !isDirty}
            onClick={() => void handleSave()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-black text-white text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={13} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-[12px] font-bold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shop Profile */}
        <Card icon={<Store size={16} className="text-brand-black" />} title="Shop Profile" subtitle="Logo, owner and shop name">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden border border-[#E5E7EB] bg-[#FBFAF6] flex items-center justify-center shrink-0">
              <img src={draft.logoUrl || BRAND_ICON} alt="Shop logo" className="w-full h-full object-cover" />
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => void handleLogoFile(e)} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 bg-white text-[11px] font-bold text-[#374151] hover:bg-[#F9FAFB]"
            >
              <Camera size={13} /> Replace Logo
            </button>
          </div>

          <Field label="Full Name">
            <input value={draft.ownerName} onChange={(e) => set('ownerName', e.target.value)} placeholder="Owner name" className={inputClass} />
            {fieldErrors.ownerName && <p className="mt-1 text-[10px] font-bold text-red-600">{fieldErrors.ownerName}</p>}
          </Field>
          <Field label="Shop Name">
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Shop name" className={inputClass} />
            {fieldErrors.name && <p className="mt-1 text-[10px] font-bold text-red-600">{fieldErrors.name}</p>}
          </Field>
          <Field label="Business Type">
            <input value={draft.businessType} onChange={(e) => set('businessType', e.target.value)} placeholder="e.g. General Store / Provisions" className={inputClass} />
          </Field>
        </Card>

        {/* Contact Details */}
        <Card icon={<Phone size={16} className="text-brand-black" />} title="Contact Details" subtitle="Shop contact only — customer details are unaffected">
          <Field label="Phone Number">
            <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" className={inputClass} />
          </Field>
          <Field label="Shop Contact Number">
            <input value={draft.shopContactNumber} onChange={(e) => set('shopContactNumber', e.target.value)} placeholder="Alternate/landline number" className={inputClass} />
          </Field>
          <Field label="Email ID">
            <input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="shop@example.com" className={inputClass} />
          </Field>
        </Card>

        {/* Shop Information */}
        <Card icon={<MapPin size={16} className="text-brand-black" />} title="Shop Information" subtitle="Address and social profile">
          <Field label="Shop Address">
            <textarea
              value={draft.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Full shop address"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-[13px] font-bold text-[#111111] outline-none focus:border-brand-black resize-none placeholder:text-gray-400 placeholder:font-medium"
            />
          </Field>
          <Field label="Instagram ID">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-gray-400">@</span>
              <input
                value={draft.instagramId}
                onChange={(e) => set('instagramId', e.target.value.replace(/^@/, ''))}
                placeholder="shop_handle"
                className={inputClass}
              />
            </div>
            {draft.instagramId.trim() && (
              <a
                href={`https://www.instagram.com/${draft.instagramId.trim()}/`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] font-bold text-emerald-700 hover:underline"
              >
                https://www.instagram.com/{draft.instagramId.trim()}/
              </a>
            )}
          </Field>
        </Card>

        {/* Appearance */}
        <Card icon={<Palette size={16} className="text-brand-black" />} title="Appearance" subtitle="Preferred colour theme — selected card colour + white stays the app theme">
          <div className="grid grid-cols-4 gap-3">
            {SHADE_OPTIONS.map((shade) => {
              const isSelected = draft.themeColor.toLowerCase() === shade.hex.toLowerCase()
              return (
                <button
                  key={shade.hex}
                  type="button"
                  onClick={() => previewShade(shade.hex)}
                  title={shade.name}
                  className={`h-12 rounded-lg border-2 transition relative ${isSelected ? 'border-brand-black' : 'border-transparent hover:border-[#E5E7EB]'}`}
                  style={{ backgroundColor: shade.hex }}
                >
                  {isSelected && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check size={14} className="text-white drop-shadow" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <Field label="Custom Colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(draft.themeColor) ? draft.themeColor : DEFAULT_THEME_COLOR}
                onChange={(e) => previewShade(e.target.value)}
                className="h-10 w-12 rounded-lg border border-[#E5E7EB] cursor-pointer bg-white"
              />
              <input
                type="text"
                value={draft.themeColor}
                onChange={(e) => set('themeColor', e.target.value)}
                onBlur={() => isValidHex(draft.themeColor) && previewShade(draft.themeColor)}
                className={`${inputClass} uppercase`}
              />
            </div>
            {fieldErrors.themeColor && <p className="mt-1 text-[10px] font-bold text-red-600">{fieldErrors.themeColor}</p>}
          </Field>
          <div className="rounded-xl overflow-hidden">
            <div className="p-4" style={{ backgroundColor: draft.themeColor }}>
              <p className="text-[10px] font-black uppercase tracking-wide text-white/70 mb-0.5">Card Preview</p>
              <p className="text-[13px] font-bold text-white">Selected colour + white stays the app theme.</p>
            </div>
          </div>
        </Card>

        {/* Product Catalogue */}
        <Card icon={<Box size={16} className="text-brand-black" />} title="Product Catalogue" subtitle="Uses the existing product & category system — nothing is duplicated">
          <button
            type="button"
            onClick={onOpenInventory}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-black text-white text-[11px] font-bold w-fit"
          >
            <Plus size={13} /> Add Product to Catalogue
          </button>
          <p className="text-[12px] font-bold text-[#374151]">{catalogueSummary.total} items in the catalogue</p>
          <div className="flex flex-wrap gap-2">
            {catalogueSummary.categories.map(([name, count]) => (
              <span key={name} className="px-3 py-1 rounded-full border border-[#E5E7EB] bg-[#FBFAF6] text-[11px] font-bold text-[#374151]">
                {name} · {count}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[#6B7280]">Product name, category, image, price and stock are managed on the existing inventory screen.</p>
        </Card>

        {/* Billing & Inventory Thresholds */}
        <Card icon={<SlidersHorizontal size={16} className="text-brand-black" />} title="Billing & Inventory Thresholds" subtitle="Automated alerts and compliance settings">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Default Low Stock Threshold">
              <input
                type="number"
                min={0}
                value={draft.lowStockThreshold}
                onChange={(e) => set('lowStockThreshold', Math.max(0, Number(e.target.value) || 0))}
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-[#6B7280]">Triggers automatic alerts and banners when product stock reaches or drops below this count.</p>
            </Field>
            <Field label="Expiry Alert Window (Days)">
              <input
                type="number"
                min={0}
                value={draft.expiryAlertDays}
                onChange={(e) => set('expiryAlertDays', Math.max(0, Number(e.target.value) || 0))}
                className={inputClass}
              />
              <p className="mt-1 text-[10px] text-[#6B7280]">Products with an expiry date land in "Expiring Soon" once they're within this many days of it.</p>
            </Field>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={draft.gstEnabled}
              onChange={(e) => set('gstEnabled', e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-black cursor-pointer"
            />
            <span>
              <span className="block text-[12px] font-bold text-[#111111]">Enable GST Billing in POS</span>
              <span className="block text-[10px] text-[#6B7280]">When enabled, GST line items are computed on invoices.</span>
            </span>
          </label>
        </Card>

        {/* Account Security */}
        <Card icon={<ShieldCheck size={16} className="text-brand-black" />} title="Account Security" subtitle="Update your admin login password.">
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-black text-white text-[11px] font-bold w-fit"
          >
            <Lock size={13} /> Change Password
          </button>
        </Card>
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  )
}
