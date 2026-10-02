import React, { useState } from 'react'
import { X, Lock } from 'lucide-react'
import { useSettingsStore } from '../../store/store'

export const ChangePasswordModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const changePassword = useSettingsStore((state) => state.changePassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required')
      return
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }

    setSubmitting(true)
    const result = await changePassword(currentPassword, newPassword)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error || 'Failed to change password')
      return
    }
    setSuccess(true)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-2xl border border-gray-200 shadow-2xl overflow-hidden max-h-[100dvh] sm:max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0 bg-[#FBFAF6]">
          <h3 className="text-sm font-black text-[#111111] flex items-center gap-2">
            <Lock size={16} className="text-brand-black" /> Change Password
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {success ? (
          <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[12px] font-bold">
              Password changed successfully.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[48px] sm:min-h-0 sm:py-2.5 rounded-xl bg-brand-black text-white text-[12px] font-bold cursor-pointer flex items-center justify-center"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-[13px] font-bold text-[#111111] outline-none focus:border-brand-black"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-[13px] font-bold text-[#111111] outline-none focus:border-brand-black"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#374151] mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-300 bg-white text-[13px] font-bold text-[#111111] outline-none focus:border-brand-black"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 text-red-800 border border-red-200 text-[12px] font-bold">
                  {error}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-20 shrink-0 bg-[#FBFAF6] border-t border-gray-200 p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:hidden min-h-[48px] px-3 rounded-xl border border-gray-300 text-[12px] font-bold text-gray-700 bg-white hover:bg-gray-100 cursor-pointer flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 sm:w-full min-h-[48px] sm:min-h-0 sm:py-2.5 rounded-xl bg-brand-black text-white text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
              >
                {submitting ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
