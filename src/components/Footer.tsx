import { useMemo } from 'react'
import { Leaf, Phone, Mail, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLangStore } from '../store/langStore'
import { useProductStore } from '../store/store'
import {
  BRAND_EN,
  BRAND_SUBTITLE,
  BRAND_EMAIL,
  BRAND_LOCATION_LINK,
  BRAND_PRIMARY_PHONE_DISPLAY,
  BRAND_PRIMARY_PHONE_E164,
  BRAND_SECONDARY_PHONE_DISPLAY,
  BRAND_SECONDARY_PHONE_E164,
  BRAND_THIRD_PHONE_DISPLAY,
  BRAND_THIRD_PHONE_E164,
  BRAND_ADDRESS,
  BRAND_LOGO,
  BRAND_ICON,
} from '../lib/brand'

export default function Footer() {
  const { t } = useLangStore()
  const products = useProductStore((state) => state.products)

  const categories = useMemo(() => {
    const derived = Array.from(new Set(
      products
        .filter((product) => product.isActive)
        .map((product) => product.category)
        .filter(Boolean),
    ))

    return derived.length > 0
      ? derived.slice(0, 6)
      : ['Herbal Powder', 'Herbal Oil', 'Herbal Root', 'Herbal Spice', 'Herbal Tablet']
  }, [products])

  const contactNumbers = [
    {
      label: t('footer.primary_number'),
      display: BRAND_PRIMARY_PHONE_DISPLAY,
      href: `tel:${BRAND_PRIMARY_PHONE_E164}`,
    },
    {
      label: t('footer.secondary_number'),
      display: BRAND_SECONDARY_PHONE_DISPLAY,
      href: `tel:${BRAND_SECONDARY_PHONE_E164}`,
    },
    {
      label: t('footer.third_number'),
      display: BRAND_THIRD_PHONE_DISPLAY,
      href: `tel:${BRAND_THIRD_PHONE_E164}`,
    },
  ]

  const remedies = useMemo(() => {
    const derived = Array.from(new Set(
      products
        .filter((product) => product.isActive)
        .flatMap((product) => product.remedy || [])
        .filter(Boolean),
    ))

    return derived.length > 0
      ? derived.slice(0, 6)
      : ['Cold & Cough', 'Digestion', 'Hair Growth', 'Immunity', 'Skin Care', 'Stress']
  }, [products])

  return (
    <footer className="bg-forestDark text-gray-300 mt-12 sm:mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14 grid grid-cols-1 md:grid-cols-4 gap-8 sm:gap-10">
        <div className="md:col-span-1">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 bg-brand-black border border-[#7daa8f]/50 rounded-xl flex items-center justify-center p-1 overflow-hidden shrink-0">
              <img src={BRAND_ICON} alt={BRAND_EN} className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-bold text-white text-base sm:text-lg font-headline leading-tight">{BRAND_EN}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-sage font-bold">{BRAND_SUBTITLE}</p>
            </div>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed mb-4">{t('footer.desc')}</p>
          <p className="text-xs text-sage font-bold uppercase tracking-wider">{t('footer.tags')}</p>
        </div>
        <div>
          <h5 className="text-white font-bold mb-4 sm:mb-5 uppercase text-xs tracking-widest">{t('footer.shop')}</h5>
          <ul className="flex flex-col gap-2.5 text-sm">
            {categories.map(c => (
              <li key={c}><Link to={`/products?cat=${encodeURIComponent(c)}`} className="hover:text-sage transition-colors">{t('cat.' + c)}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-white font-bold mb-4 sm:mb-5 uppercase text-xs tracking-widest">{t('footer.remedies')}</h5>
          <ul className="flex flex-col gap-2.5 text-sm">
            {remedies.map(r => (
              <li key={r}><Link to={`/products?remedy=${encodeURIComponent(r)}`} className="hover:text-sage transition-colors">{t('remedy.' + r)}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="text-white font-bold mb-4 sm:mb-5 uppercase text-xs tracking-widest">{t('footer.contact')}</h5>
          <ul className="flex flex-col gap-4 text-sm">
            <li className="flex items-start gap-3">
              <MapPin size={15} className="text-sage mt-0.5 shrink-0" />
              <div className="flex flex-col gap-1">
                <a href={BRAND_LOCATION_LINK} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Google Maps</a>
                <span className="text-[11px] leading-relaxed text-gray-500 max-w-[260px]">{BRAND_ADDRESS}</span>
              </div>
            </li>
            {contactNumbers.map((contact) => (
              <li key={contact.label} className="flex items-start gap-3">
                <Phone size={15} className="text-sage mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{contact.label}</span>
                  <a href={contact.href} className="hover:text-white transition-colors">{contact.display}</a>
                </div>
              </li>
            ))}
            <li className="flex items-start gap-3 flex-wrap">
              <Mail size={15} className="text-sage mt-0.5 shrink-0" />
              <a href={`mailto:${BRAND_EMAIL}`} className="min-w-0 break-all hover:text-white transition-colors">{BRAND_EMAIL}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs space-y-1.5">
        <div className="text-gray-200 font-medium">{t('footer.rights')}</div>
        <div className="text-gray-200 font-bold">{t('footer.powered_by')}</div>
      </div>
    </footer>
  )
}
