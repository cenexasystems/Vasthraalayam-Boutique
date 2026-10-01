import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Plus,
  Info,
  Check,
  Pencil,
  Trash2,
  Copy,
  Star,
  ChevronDown,
  ChevronUp,
  Printer,
  Download,
  RotateCw,
  Sliders,
  SlidersHorizontal,
  Bookmark,
} from 'lucide-react'
import {
  type BarcodeSettings,
  type LabelSizeConfig,
  type LabelCategory,
  type PrinterProfile,
  type PrinterType,
  type BarcodeType,
  type RotationAngle,
  type OrientationType,
  DEFAULT_LABEL_SIZES,
  DEFAULT_PRINTER_PROFILE,
  getStoredCustomSizes,
  saveStoredBarcodeSettings,
  fetchCustomSizesFromDb,
  deleteCustomSizeInDb,
  saveLastUsedSizeId,
  getCurrentBusinessId,
  getLabelRenderMetrics,
  getStoredPrinterProfiles,
  fetchPrinterProfilesFromDb,
  createPrinterProfileInDb,
  updatePrinterProfileInDb,
  deletePrinterProfileInDb,
  setDefaultPrinterProfileInDb,
  duplicatePrinterProfileInDb,
  saveLastUsedProfileId,
  getDefaultsForPrinterType,
  executeTestPrint,
  downloadTestLabelPdf,
} from '../../lib/barcode'
import { CreateCustomSizeModal } from './CreateCustomSizeModal'

interface BarcodeSettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  settings: BarcodeSettings
  onUpdateSettings: (newSettings: BarcodeSettings) => void
  businessId?: string
}

const CATEGORY_ORDER: LabelCategory[] = [
  'Small Tags',
  'Retail Labels',
  'Shipping',
  'Roll Layouts',
  'A4 Sheets',
]

export const BarcodeSettingsDrawer: React.FC<BarcodeSettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  businessId,
}) => {
  const activeBizId = businessId || getCurrentBusinessId()

  // Profiles State
  const [profiles, setProfiles] = useState<PrinterProfile[]>(() => getStoredPrinterProfiles(activeBizId))
  const [activeProfile, setActiveProfile] = useState<PrinterProfile>(() => {
    return settings.profile || profiles.find((p) => p.is_default) || profiles[0] || DEFAULT_PRINTER_PROFILE
  })
  const [showSaveProfileModal, setShowSaveProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [profileMessage, setProfileMessage] = useState<string | null>(null)

  // Custom Sizes State
  const [customSizes, setCustomSizes] = useState<LabelSizeConfig[]>(() => getStoredCustomSizes(activeBizId))
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [editingCustomSize, setEditingCustomSize] = useState<LabelSizeConfig | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Accordion Section States (Default: Printer & Profiles open)
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    printer: true,
    size: true,
    content: false,
    finetune: false,
  })

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Sync Profiles & Custom Sizes from Neon DB on open
  useEffect(() => {
    if (!isOpen) return
    let active = true

    // 1. Fetch custom sizes
    fetchCustomSizesFromDb(activeBizId).then(({ sizes, lastUsedSizeId }) => {
      if (!active) return
      setCustomSizes(sizes)
      if (lastUsedSizeId && lastUsedSizeId !== settings.selectedSizeId) {
        const sizeExists = [...DEFAULT_LABEL_SIZES, ...sizes].some((s) => s.id === lastUsedSizeId)
        if (sizeExists) {
          const updated = { ...settings, selectedSizeId: lastUsedSizeId }
          saveStoredBarcodeSettings(updated, activeBizId)
          onUpdateSettings(updated)
        }
      }
    })

    // 2. Fetch printer profiles
    fetchPrinterProfilesFromDb(activeBizId).then(({ profiles: dbProfiles, lastUsedProfileId }) => {
      if (!active) return
      if (dbProfiles && dbProfiles.length > 0) {
        setProfiles(dbProfiles)
        const targetId = lastUsedProfileId || settings.selectedProfileId
        const match = dbProfiles.find((p) => p.id === targetId) || dbProfiles.find((p) => p.is_default) || dbProfiles[0]
        if (match) {
          setActiveProfile(match)
          const updated: BarcodeSettings = {
            ...settings,
            printerType: match.printer_type,
            selectedSizeId: match.size_id,
            selectedProfileId: match.id,
            showSalePrice: match.show_price,
            showCompanyName: match.show_business_name,
            showItemName: match.show_product_name,
            showDiscount: match.show_mrp,
            profile: match,
          }
          saveStoredBarcodeSettings(updated, activeBizId)
          onUpdateSettings(updated)
        }
      }
    })

    return () => {
      active = false
    }
  }, [isOpen, activeBizId])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showCustomModal && !showSaveProfileModal) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, showCustomModal, showSaveProfileModal])

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  // Helpers to push profile changes
  const applyProfileUpdates = (patch: Partial<PrinterProfile>) => {
    const updatedProfile: PrinterProfile = { ...activeProfile, ...patch }
    setActiveProfile(updatedProfile)

    const updatedSettings: BarcodeSettings = {
      ...settings,
      printerType: updatedProfile.printer_type,
      selectedSizeId: updatedProfile.size_id,
      selectedProfileId: updatedProfile.id,
      showSalePrice: updatedProfile.show_price,
      showCompanyName: updatedProfile.show_business_name,
      showItemName: updatedProfile.show_product_name,
      showDiscount: updatedProfile.show_mrp,
      profile: updatedProfile,
    }

    // Save locally and in state
    saveStoredBarcodeSettings(updatedSettings, activeBizId)
    onUpdateSettings(updatedSettings)

    // Save to profiles list
    setProfiles((prev) => prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p)))
    void updatePrinterProfileInDb(updatedProfile, activeBizId)
  }

  // Profile Switching
  const handleSelectProfile = (profileId: string) => {
    const found = profiles.find((p) => p.id === profileId)
    if (!found) return
    setActiveProfile(found)
    void saveLastUsedProfileId(profileId, activeBizId)

    const updatedSettings: BarcodeSettings = {
      ...settings,
      printerType: found.printer_type,
      selectedSizeId: found.size_id,
      selectedProfileId: found.id,
      showSalePrice: found.show_price,
      showCompanyName: found.show_business_name,
      showItemName: found.show_product_name,
      showDiscount: found.show_mrp,
      profile: found,
    }
    saveStoredBarcodeSettings(updatedSettings, activeBizId)
    onUpdateSettings(updatedSettings)

    setProfileMessage(`Loaded profile "${found.name}"`)
    setTimeout(() => setProfileMessage(null), 2500)
  }

  // Profile Operations
  const handleSaveAsNewProfile = async () => {
    if (!newProfileName.trim()) return
    try {
      const created = await createPrinterProfileInDb(
        {
          ...activeProfile,
          name: newProfileName.trim(),
          is_default: false,
        },
        activeBizId
      )
      setProfiles((prev) => [...prev, created])
      setActiveProfile(created)
      setShowSaveProfileModal(false)
      setNewProfileName('')
      setProfileMessage(`Saved profile "${created.name}"`)
      setTimeout(() => setProfileMessage(null), 3000)
    } catch (e) {
      console.error('Failed to create profile:', e)
    }
  }

  const handleSetDefaultProfile = async () => {
    try {
      await setDefaultPrinterProfileInDb(activeProfile.id, activeBizId)
      setProfiles((prev) =>
        prev.map((p) => ({ ...p, is_default: p.id === activeProfile.id }))
      )
      setActiveProfile((prev) => ({ ...prev, is_default: true }))
      setProfileMessage(`Set "${activeProfile.name}" as default profile`)
      setTimeout(() => setProfileMessage(null), 2500)
    } catch (e) {
      console.error('Failed to set default profile:', e)
    }
  }

  const handleDuplicateProfile = async () => {
    try {
      const duplicated = await duplicatePrinterProfileInDb(activeProfile.id, activeBizId)
      if (duplicated) {
        setProfiles((prev) => [...prev, duplicated])
        setActiveProfile(duplicated)
        setProfileMessage(`Duplicated as "${duplicated.name}"`)
        setTimeout(() => setProfileMessage(null), 2500)
      }
    } catch (e) {
      console.error('Failed to duplicate profile:', e)
    }
  }

  const handleRenameProfile = async () => {
    const currentName = activeProfile.name
    const prompted = window.prompt('Rename profile:', currentName)
    if (!prompted || prompted.trim() === '' || prompted.trim() === currentName) return
    const updated = { ...activeProfile, name: prompted.trim() }
    applyProfileUpdates({ name: prompted.trim() })
    await updatePrinterProfileInDb(updated, activeBizId)
    setProfileMessage(`Renamed to "${prompted.trim()}"`)
    setTimeout(() => setProfileMessage(null), 2500)
  }

  const handleDeleteProfile = async () => {
    if (profiles.length <= 1) {
      alert('Cannot delete the only remaining profile.')
      return
    }
    if (!window.confirm(`Delete profile "${activeProfile.name}"?`)) return
    try {
      await deletePrinterProfileInDb(activeProfile.id, activeBizId)
      const remaining = profiles.filter((p) => p.id !== activeProfile.id)
      setProfiles(remaining)
      const fallback = remaining[0] || DEFAULT_PRINTER_PROFILE
      setActiveProfile(fallback)
      handleSelectProfile(fallback.id)
      setProfileMessage('Profile deleted')
      setTimeout(() => setProfileMessage(null), 2500)
    } catch (e) {
      console.error('Failed to delete profile:', e)
    }
  }

  // Printer Type change (with sensible defaults)
  const handlePrinterTypeSelect = (type: PrinterType) => {
    const defaults = getDefaultsForPrinterType(type)
    applyProfileUpdates({
      ...defaults,
      printer_type: type,
    })
  }

  // Label Size change
  const handleSizeChange = (sizeId: string) => {
    applyProfileUpdates({ size_id: sizeId })
    saveLastUsedSizeId(sizeId, activeBizId)
  }

  // Custom Size Delete
  const handleDeleteCustomSize = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this custom label size?')) return
    setDeletingId(id)
    try {
      await deleteCustomSizeInDb(id, activeBizId)
      const updatedList = customSizes.filter((s) => s.id !== id)
      setCustomSizes(updatedList)

      if (activeProfile.size_id === id) {
        handleSizeChange('2_38x25')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const handleEditCustomSize = (size: LabelSizeConfig, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingCustomSize(size)
    setShowCustomModal(true)
  }

  const allSizes = [...DEFAULT_LABEL_SIZES, ...customSizes]
  const currentSelectedSize = allSizes.find((s) => s.id === activeProfile.size_id) || DEFAULT_LABEL_SIZES[3]

  // Selected size metrics & real aspect ratio calculation for preview
  const previewMetrics = getLabelRenderMetrics(
    currentSelectedSize.width_mm,
    currentSelectedSize.height_mm,
    activeProfile.font_scale,
    activeProfile.barcode_height_scale
  )
  const columns = currentSelectedSize.columns || 1
  const gapMm = currentSelectedSize.gap_mm || 0
  const totalPhysicalWidth = currentSelectedSize.width_mm * columns + (columns > 1 ? gapMm * (columns - 1) : 0)
  const physicalHeight = currentSelectedSize.height_mm
  const aspectRatio = totalPhysicalWidth / physicalHeight

  // Bounding box for preview widget inside drawer (max width: 230px, max height: 95px)
  const maxBoxW = 220
  const maxBoxH = 90
  let boxW = maxBoxW
  let boxH = maxBoxW / aspectRatio
  if (boxH > maxBoxH) {
    boxH = maxBoxH
    boxW = maxBoxH * aspectRatio
  }
  const singleColWidth = Math.max(22, (boxW - (columns > 1 ? 4 * (columns - 1) : 0)) / columns)

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-screen h-screen h-[100dvh] z-[9999] flex justify-end bg-black/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="absolute inset-0" onClick={onClose} />
          <div className="relative z-10 w-full max-w-md bg-white h-screen h-[100dvh] shadow-2xl flex flex-col border-l border-gray-200 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-brand-black text-white shrink-0">
              <div className="flex items-center gap-2">
                <Sliders className="text-[#7daa8f]" size={16} />
                <h3 className="text-sm font-black tracking-wide text-white">Barcode &amp; Printer Settings</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Notification alert banner */}
            {profileMessage && (
              <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs text-emerald-800 font-bold flex items-center justify-between">
                <span>{profileMessage}</span>
                <Check size={14} className="text-emerald-600" />
              </div>
            )}

            {/* Drawer Body (Scrollable Accordion) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* SECTION 1: PRINTER & PROFILES */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs bg-[#FBFAF6]">
                <button
                  type="button"
                  onClick={() => toggleSection('printer')}
                  className="w-full px-4 py-3 bg-white flex items-center justify-between text-left cursor-pointer border-b border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <Printer size={15} className="text-gray-700" />
                    <span className="text-xs font-black uppercase tracking-wider text-gray-900">
                      1. Printer &amp; Profiles
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-500 capitalize">
                      {activeProfile.name}
                    </span>
                    {openSections.printer ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {openSections.printer && (
                  <div className="p-4 space-y-4">
                    {/* Active Profile Dropdown & Controls */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                          <Bookmark size={12} className="text-blue-600" /> Saved Profiles
                        </label>
                        <span className="text-[10px] text-gray-400 font-bold">Scoped to Business</span>
                      </div>

                      <div className="flex gap-2">
                        <select
                          value={activeProfile.id}
                          onChange={(e) => handleSelectProfile(e.target.value)}
                          className="flex-1 h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-brand-black"
                        >
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.is_default ? '★ (Default)' : ''}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setNewProfileName(`${activeProfile.name} Copy`)
                            setShowSaveProfileModal(true)
                          }}
                          title="Save as new profile"
                          className="px-2.5 h-9 rounded-xl bg-brand-black text-brand-onDark border border-[#7daa8f] text-[11px] font-black uppercase tracking-wider hover:bg-[#1e2817] flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={12} /> Save As
                        </button>
                      </div>

                      {/* Profile action pills */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                        {!activeProfile.is_default && (
                          <button
                            type="button"
                            onClick={handleSetDefaultProfile}
                            className="px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 font-bold flex items-center gap-1 hover:bg-amber-100 cursor-pointer"
                          >
                            <Star size={11} className="fill-amber-500 text-amber-500" /> Set as Default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleRenameProfile}
                          className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold flex items-center gap-1 hover:bg-gray-50 cursor-pointer"
                        >
                          <Pencil size={11} /> Rename
                        </button>
                        <button
                          type="button"
                          onClick={handleDuplicateProfile}
                          className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold flex items-center gap-1 hover:bg-gray-50 cursor-pointer"
                        >
                          <Copy size={11} /> Duplicate
                        </button>
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={handleDeleteProfile}
                            className="px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold flex items-center gap-1 hover:bg-red-100 cursor-pointer"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Printer Type Dropdown */}
                    <div className="space-y-1.5 pt-2 border-t border-gray-200">
                      <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 block">
                        Printer Type
                      </label>
                      <select
                        value={activeProfile.printer_type}
                        onChange={(e) => handlePrinterTypeSelect(e.target.value as PrinterType)}
                        className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-brand-black"
                      >
                        <option value="label">Thermal Label Printer (TSC, Zebra, TVS, Godex, Xprinter, Brother QL)</option>
                        <option value="receipt">Thermal Roll Receipt Printer (58 mm / 80 mm)</option>
                        <option value="sheet">Inkjet / Laser on A4 Sticker Sheets (also A5 / Letter)</option>
                        <option value="pdf">Save as PDF (for printing elsewhere / mobile)</option>
                      </select>
                      <p className="text-[10px] text-gray-500 font-medium italic pt-0.5">
                        * Darkness/density is configured in your printer driver / system print dialog.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: LABEL SIZE */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs bg-[#FBFAF6]">
                <button
                  type="button"
                  onClick={() => toggleSection('size')}
                  className="w-full px-4 py-3 bg-white flex items-center justify-between text-left cursor-pointer border-b border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={15} className="text-gray-700" />
                    <span className="text-xs font-black uppercase tracking-wider text-gray-900">
                      2. Label Size
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-[#7daa8f] bg-brand-black px-2 py-0.5 rounded-full">
                      {currentSelectedSize.width_mm} × {currentSelectedSize.height_mm} mm
                    </span>
                    {openSections.size ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {openSections.size && (
                  <div className="p-4 space-y-4">
                    {/* Live preview scaled to real aspect ratio */}
                    <div className="p-3 bg-gradient-to-b from-[#FFFDF7] to-[#F8F5EB] rounded-xl border border-[#E8DEC8] shadow-xs flex flex-col items-center">
                      <div className="w-full flex items-center justify-between mb-1.5 px-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">
                          Aspect Ratio Preview ({currentSelectedSize.width_mm} × {currentSelectedSize.height_mm} mm
                          {columns > 1 ? ` × ${columns}-Up` : ''})
                        </span>
                        <span className="text-[9px] font-bold text-gray-500">
                          {aspectRatio.toFixed(2)}:1
                        </span>
                      </div>

                      {/* Physical Aspect Ratio Scaled Frame */}
                      <div
                        className="flex items-center justify-center gap-1.5 bg-white border border-gray-300 rounded-lg p-1.5 shadow-xs relative overflow-hidden"
                        style={{
                          width: `${Math.round(boxW)}px`,
                          height: `${Math.round(boxH)}px`,
                        }}
                      >
                        {Array.from({ length: columns }).map((_, colIdx) => (
                          <div
                            key={colIdx}
                            className="bg-white rounded border border-gray-200 p-1 flex flex-col items-center justify-between text-center overflow-hidden h-full shadow-2xs"
                            style={{
                              width: `${Math.round(singleColWidth)}px`,
                            }}
                          >
                            {!previewMetrics.isVerySmall && activeProfile.show_business_name && (
                              <span
                                className="font-black text-gray-800 tracking-wider truncate max-w-full leading-none"
                                style={{ fontSize: '7px' }}
                              >
                                VASTHRAALAYAM
                              </span>
                            )}
                            {/* Barcode lines simulation */}
                            <div className="flex items-center justify-center gap-[1px] h-3.5 my-0.5 max-w-full overflow-hidden">
                              <div className="w-[1.2px] h-full bg-black shrink-0" />
                              <div className="w-[1px] h-full bg-black shrink-0" />
                              <div className="w-[2px] h-full bg-black shrink-0" />
                              <div className="w-[1px] h-full bg-black shrink-0" />
                              <div className="w-[1.5px] h-full bg-black shrink-0" />
                              <div className="w-[1px] h-full bg-black shrink-0" />
                              <div className="w-[2px] h-full bg-black shrink-0" />
                              <div className="w-[1px] h-full bg-black shrink-0" />
                            </div>
                            <div className="w-full flex items-center justify-between px-0.5 leading-none">
                              <span className="text-[6.5px] font-mono font-bold text-gray-700 truncate">
                                {previewMetrics.isVerySmall ? 'V001' : 'SKU-01'}
                              </span>
                              {activeProfile.show_price && (
                                <span className="text-[7px] font-black text-gray-900">₹999</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Categorized size list with radio buttons */}
                    <div className="bg-white p-3 rounded-xl border border-gray-200 divide-y divide-gray-200 space-y-3">
                      {CATEGORY_ORDER.map((category) => {
                        const categorySizes = DEFAULT_LABEL_SIZES.filter((s) => s.category === category)
                        if (categorySizes.length === 0) return null

                        return (
                          <div key={category} className="pt-2 first:pt-0">
                            <div className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-black" />
                              {category}
                            </div>
                            <div className="space-y-1.5 pl-1">
                              {categorySizes.map((size) => (
                                <label
                                  key={size.id}
                                  className="flex items-center justify-between gap-2 text-xs font-bold text-gray-700 cursor-pointer hover:text-black py-0.5"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="radio"
                                      name="labelSize"
                                      checked={activeProfile.size_id === size.id}
                                      onChange={() => handleSizeChange(size.id)}
                                      className="accent-brand-black w-4 h-4 cursor-pointer"
                                    />
                                    <span className={activeProfile.size_id === size.id ? 'text-black font-black' : ''}>
                                      {size.label}
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )
                      })}

                      {/* Custom Sizes Category */}
                      {customSizes.length > 0 && (
                        <div className="pt-2">
                          <div className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                              Custom Sizes
                            </div>
                            <span className="text-[9px] font-bold text-blue-600 lowercase bg-blue-50 px-1 rounded">
                              synced to db
                            </span>
                          </div>
                          <div className="space-y-1.5 pl-1">
                            {customSizes.map((size) => (
                              <div
                                key={size.id}
                                className="flex items-center justify-between gap-2 text-xs font-bold text-gray-700 hover:text-black py-0.5 group"
                              >
                                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                                  <input
                                    type="radio"
                                    name="labelSize"
                                    checked={activeProfile.size_id === size.id}
                                    onChange={() => handleSizeChange(size.id)}
                                    className="accent-brand-black w-4 h-4 cursor-pointer shrink-0"
                                  />
                                  <span className={`truncate ${activeProfile.size_id === size.id ? 'text-black font-black' : ''}`}>
                                    {size.label}
                                  </span>
                                </label>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={(e) => handleEditCustomSize(size, e)}
                                    title="Edit custom size"
                                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingId === size.id}
                                    onClick={(e) => handleDeleteCustomSize(size.id, e)}
                                    title="Delete custom size"
                                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* + Create Custom Size Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCustomSize(null)
                            setShowCustomModal(true)
                          }}
                          className="flex items-center gap-1.5 text-xs font-black text-blue-600 hover:text-blue-800 hover:underline pt-1 w-full cursor-pointer"
                        >
                          <Plus size={13} />
                          Create Custom Size <Info size={12} className="text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: CONTENT & BARCODE */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs bg-[#FBFAF6]">
                <button
                  type="button"
                  onClick={() => toggleSection('content')}
                  className="w-full px-4 py-3 bg-white flex items-center justify-between text-left cursor-pointer border-b border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <Sliders size={15} className="text-gray-700" />
                    <span className="text-xs font-black uppercase tracking-wider text-gray-900">
                      3. Content &amp; Barcode
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-500">
                      {activeProfile.barcode_type} • Scale: {Math.round(activeProfile.font_scale * 100)}%
                    </span>
                    {openSections.content ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {openSections.content && (
                  <div className="p-4 space-y-4">
                    {/* Barcode Type */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 block">
                        Barcode Type / Format
                      </label>
                      <select
                        value={activeProfile.barcode_type}
                        onChange={(e) => applyProfileUpdates({ barcode_type: e.target.value as BarcodeType })}
                        className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none focus:border-brand-black"
                      >
                        <option value="CODE128">CODE128 (Default standard retail barcode)</option>
                        <option value="EAN13">EAN-13 (Standard 13-digit retail barcode)</option>
                        <option value="UPC">UPC (12-digit standard)</option>
                        <option value="QR">QR Code (2D Matrix, fast mobile phone scanning)</option>
                      </select>
                    </div>

                    {/* Typography Font Scale Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
                        <span>Font Size Scale</span>
                        <span className="font-mono">{Math.round(activeProfile.font_scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.80"
                        max="1.50"
                        step="0.05"
                        value={activeProfile.font_scale}
                        onChange={(e) => applyProfileUpdates({ font_scale: parseFloat(e.target.value) })}
                        className="w-full accent-brand-black cursor-pointer"
                      />
                    </div>

                    {/* Barcode Height Scale Slider */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
                        <span>Barcode Height Scale</span>
                        <span className="font-mono">{Math.round(activeProfile.barcode_height_scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.50"
                        max="1.50"
                        step="0.05"
                        value={activeProfile.barcode_height_scale}
                        onChange={(e) => applyProfileUpdates({ barcode_height_scale: parseFloat(e.target.value) })}
                        className="w-full accent-brand-black cursor-pointer"
                      />
                    </div>

                    {/* Content Toggles */}
                    <div className="space-y-2 pt-2 border-t border-gray-200">
                      <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 block">
                        Visible Label Content
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs font-bold text-gray-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_product_name}
                            onChange={(e) => applyProfileUpdates({ show_product_name: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          Product Name
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_price}
                            onChange={(e) => applyProfileUpdates({ show_price: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          Sale Price (₹)
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_sku}
                            onChange={(e) => applyProfileUpdates({ show_sku: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          SKU / Code
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_mrp}
                            onChange={(e) => applyProfileUpdates({ show_mrp: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          MRP / Discount
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_variant}
                            onChange={(e) => applyProfileUpdates({ show_variant: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          Size / Variant
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_business_name}
                            onChange={(e) => applyProfileUpdates({ show_business_name: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          Company Name
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeProfile.show_date}
                            onChange={(e) => applyProfileUpdates({ show_date: e.target.checked })}
                            className="accent-brand-black w-4 h-4 rounded cursor-pointer"
                          />
                          Print Date
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 4: FINE-TUNE & CALIBRATION */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-xs bg-[#FBFAF6]">
                <button
                  type="button"
                  onClick={() => toggleSection('finetune')}
                  className="w-full px-4 py-3 bg-white flex items-center justify-between text-left cursor-pointer border-b border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <RotateCw size={15} className="text-gray-700" />
                    <span className="text-xs font-black uppercase tracking-wider text-gray-900">
                      4. Fine-Tune Offsets &amp; Alignment
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-gray-500">
                      X:{activeProfile.offset_x_mm}mm Y:{activeProfile.offset_y_mm}mm
                    </span>
                    {openSections.finetune ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </button>

                {openSections.finetune && (
                  <div className="p-4 space-y-4">
                    {/* Orientation & Rotation */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                          Orientation
                        </label>
                        <select
                          value={activeProfile.orientation}
                          onChange={(e) => applyProfileUpdates({ orientation: e.target.value as OrientationType })}
                          className="w-full h-9 px-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none"
                        >
                          <option value="portrait">Portrait</option>
                          <option value="landscape">Landscape</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                          Rotation
                        </label>
                        <select
                          value={activeProfile.rotation}
                          onChange={(e) => applyProfileUpdates({ rotation: parseInt(e.target.value, 10) as RotationAngle })}
                          className="w-full h-9 px-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-900 outline-none"
                        >
                          <option value={0}>0° (Normal)</option>
                          <option value={90}>90° (Clockwise)</option>
                          <option value={180}>180° (Inverted)</option>
                          <option value={270}>270° (Counter)</option>
                        </select>
                      </div>
                    </div>

                    {/* Fine-tune Drift Offsets (±5 mm in 0.5 mm steps) */}
                    <div className="p-3 bg-white rounded-xl border border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase tracking-wider text-gray-800">
                          Hardware Drift Offsets (±5.0 mm)
                        </span>
                        <button
                          type="button"
                          onClick={() => applyProfileUpdates({ offset_x_mm: 0, offset_y_mm: 0 })}
                          className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                        >
                          Reset to 0
                        </button>
                      </div>

                      {/* Offset X */}
                      <div>
                        <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                          <span>Horizontal Offset X (Left/Right)</span>
                          <span className="font-mono">{activeProfile.offset_x_mm > 0 ? `+${activeProfile.offset_x_mm}` : activeProfile.offset_x_mm} mm</span>
                        </div>
                        <input
                          type="range"
                          min="-5.0"
                          max="5.0"
                          step="0.5"
                          value={activeProfile.offset_x_mm}
                          onChange={(e) => applyProfileUpdates({ offset_x_mm: parseFloat(e.target.value) })}
                          className="w-full accent-brand-black cursor-pointer"
                        />
                      </div>

                      {/* Offset Y */}
                      <div>
                        <div className="flex justify-between text-xs font-bold text-gray-700 mb-1">
                          <span>Vertical Offset Y (Top/Bottom)</span>
                          <span className="font-mono">{activeProfile.offset_y_mm > 0 ? `+${activeProfile.offset_y_mm}` : activeProfile.offset_y_mm} mm</span>
                        </div>
                        <input
                          type="range"
                          min="-5.0"
                          max="5.0"
                          step="0.5"
                          value={activeProfile.offset_y_mm}
                          onChange={(e) => applyProfileUpdates({ offset_y_mm: parseFloat(e.target.value) })}
                          className="w-full accent-brand-black cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Sheet Start Position (for skipping already used stickers on A4 sheets) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black uppercase tracking-wider text-gray-700">
                          Sheet Start Position (Skip used labels)
                        </label>
                        <span className="text-[10px] text-gray-400 font-bold">1 to 65</span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="65"
                        value={activeProfile.sheet_start_position || 1}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          applyProfileUpdates({ sheet_start_position: isNaN(val) ? 1 : Math.max(1, Math.min(65, val)) })
                        }}
                        className="w-full h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-black text-gray-900 outline-none focus:border-brand-black"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* QUICK ACTION BUTTONS (Test Print & Download PDF) */}
              <div className="p-3 bg-white border border-gray-200 rounded-2xl space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">
                  Calibration &amp; Testing
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => executeTestPrint(currentSelectedSize, activeProfile)}
                    className="py-2 px-3 rounded-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-800 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={13} /> Print Test Label
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadTestLabelPdf(currentSelectedSize, activeProfile)}
                    className="py-2 px-3 rounded-xl border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-800 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download size={13} /> Download PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-brand-black text-brand-onDark border border-[#7daa8f] font-black text-xs uppercase tracking-wider hover:bg-[#1e2817] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Check size={14} /> Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Save Profile Modal */}
      {showSaveProfileModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-5 max-w-sm w-full space-y-4">
            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">
              Save as Printer Profile
            </h4>
            <p className="text-xs text-gray-500">
              Save your current size, offsets, printer type and layout settings as a reusable profile synced across devices.
            </p>
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-700 block mb-1">
                Profile Name
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Counter TSC 50×25"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveAsNewProfile()
                }}
                className="w-full h-10 px-3 rounded-xl border border-gray-300 text-xs font-bold outline-none focus:border-brand-black"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveProfileModal(false)}
                className="px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAsNewProfile}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 rounded-xl bg-brand-black text-brand-onDark border border-[#7daa8f] text-xs font-black uppercase tracking-wider hover:bg-[#1e2817] disabled:opacity-50 cursor-pointer"
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Size Modal */}
      {showCustomModal && (
        <CreateCustomSizeModal
          isOpen={showCustomModal}
          initialSize={editingCustomSize}
          businessId={activeBizId}
          onClose={() => {
            setShowCustomModal(false)
            setEditingCustomSize(null)
          }}
          onSaved={(newSize) => {
            const current = getStoredCustomSizes(activeBizId)
            const exists = current.some((s) => s.id === newSize.id)
            const updated = exists
              ? current.map((s) => (s.id === newSize.id ? newSize : s))
              : [...current, newSize]
            setCustomSizes(updated)
            handleSizeChange(newSize.id)
          }}
        />
      )}
    </>
  )
}
