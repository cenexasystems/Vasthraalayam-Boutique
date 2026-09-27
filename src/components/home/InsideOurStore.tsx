import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { galleryImages } from '../../data/galleryImages'

const TRUST_BADGES = [
  'Since 1945',
  'Authentic Herbal Products',
  'Traditional Pooja Materials',
  'Expert Guidance',
  'Trusted By Thousands',
]

// First 6 images — hero is always index 0
const preview = galleryImages.slice(0, 6)

const EASE = [0.22, 1, 0.36, 1] as const

export default function InsideOurStore() {
  return (
    <section
      className="py-20 sm:py-28"
      style={{ background: 'linear-gradient(160deg, #f4f8f1 0%, #faf8f4 60%, #f9f5ee 100%)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Mobile/tablet header — visible only below lg */}
        <motion.div
          className="lg:hidden mb-10 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#7daa8f] mb-3">
            A Glimpse of Our Tradition
          </p>
          <h2 className="text-[2rem] sm:text-[2.6rem] font-black text-[#111111] tracking-tight leading-[1.05] mb-4">
            Inside Our Store
          </h2>
          <p className="text-[15px] text-[#374151] font-medium leading-[1.7] max-w-lg mx-auto">
            Explore our traditional herbal and pooja store, where quality and authenticity
            have been our promise since 1945.
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">

          {/* ── LEFT: Content (35%) ── */}
          <div className="w-full lg:w-[35%] shrink-0">

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: EASE }}
              className="hidden lg:block text-[10px] font-black uppercase tracking-[0.26em] text-[#7daa8f] mb-4"
            >
              A Glimpse of Our Tradition
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.06, ease: EASE }}
              className="hidden lg:block text-[2.6rem] xl:text-[3rem] font-black text-[#111111] tracking-tight leading-[1.03] mb-5"
            >
              Inside Our Store
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.12, ease: EASE }}
              className="hidden lg:block text-[15px] xl:text-[16px] text-[#374151] font-medium leading-[1.75] mb-8"
            >
              Explore our traditional herbal and pooja store, where quality and
              authenticity have been our promise since 1945.
            </motion.p>

            {/* Trust badges */}
            <motion.ul
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: 0.18, ease: EASE }}
              className="space-y-3 mb-10"
            >
              {TRUST_BADGES.map((badge) => (
                <li key={badge} className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#111111] flex items-center justify-center">
                    <Check size={11} strokeWidth={3} className="text-white" />
                  </span>
                  <span className="text-[14px] font-semibold text-[#111111]">{badge}</span>
                </li>
              ))}
            </motion.ul>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.24, ease: EASE }}
            >
              <Link
                to="/gallery"
                className="group inline-flex items-center gap-2.5
                  px-7 py-3.5
                  bg-[#111111] text-white font-bold rounded-full
                  text-[13px] xl:text-[14px]
                  shadow-[0_4px_22px_rgba(44,57,42,0.28)]
                  hover:bg-[#1e2817]
                  hover:shadow-[0_8px_32px_rgba(44,57,42,0.38)]
                  hover:-translate-y-px
                  transition-all duration-200"
              >
                View Complete Gallery
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
              </Link>
            </motion.div>
          </div>

          {/* ── RIGHT: Premium Masonry Gallery (65%) ── */}
          <div className="w-full lg:w-[65%] min-w-0">

            {/* Desktop: hero left + 4 supporting + wide bottom strip */}
            <div
              className="hidden lg:grid gap-3 xl:gap-4"
              style={{
                gridTemplateColumns: '1.35fr 1fr 1fr',
                gridTemplateRows: '1fr 1fr 150px',
                height: '600px',
              }}
            >
              {/* img1 HERO — spans 2 rows */}
              <motion.div
                className="row-span-2 rounded-[24px] overflow-hidden shadow-[0_16px_48px_rgba(44,57,42,0.14)]"
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: EASE }}
                whileHover={{ scale: 1.02 }}
              >
                <img src={preview[0].image} alt={preview[0].title} loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500" />
              </motion.div>

              {[1, 2, 3, 4].map((i, idx) => (
                <motion.div
                  key={preview[i].id}
                  className="rounded-[24px] overflow-hidden shadow-[0_8px_28px_rgba(44,57,42,0.10)]"
                  initial={{ opacity: 0, scale: 0.97 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: 0.08 + idx * 0.07, ease: EASE }}
                  whileHover={{ scale: 1.03 }}
                >
                  <img src={preview[i].image} alt={preview[i].title} loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500" />
                </motion.div>
              ))}

              {/* img6 — wide panoramic bottom strip */}
              <motion.div
                className="col-span-3 rounded-[24px] overflow-hidden shadow-[0_8px_28px_rgba(44,57,42,0.10)]"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.36, ease: EASE }}
                whileHover={{ scale: 1.015 }}
              >
                <img src={preview[5].image} alt={preview[5].title} loading="lazy"
                  className="w-full h-full object-cover object-center transition-transform duration-500" />
              </motion.div>
            </div>

            {/* Tablet: hero left spanning 2 rows + 3 supporting */}
            <div className="hidden sm:grid lg:hidden grid-cols-2 gap-3">
              <motion.div
                className="row-span-2 rounded-[24px] overflow-hidden shadow-[0_12px_36px_rgba(44,57,42,0.12)] aspect-[3/4]"
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                <img src={preview[0].image} alt={preview[0].title} loading="lazy"
                  className="w-full h-full object-cover" />
              </motion.div>
              {[1, 2, 3].map((i, idx) => (
                <motion.div
                  key={preview[i].id}
                  className="rounded-[24px] overflow-hidden shadow-[0_8px_24px_rgba(44,57,42,0.09)] aspect-[4/3]"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 + idx * 0.07, ease: EASE }}
                >
                  <img src={preview[i].image} alt={preview[i].title} loading="lazy"
                    className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </div>

            {/* Mobile: single column, 4 images */}
            <div className="sm:hidden flex flex-col gap-3">
              {preview.slice(0, 4).map((img, idx) => (
                <motion.div
                  key={img.id}
                  className={`rounded-[20px] overflow-hidden shadow-[0_8px_24px_rgba(44,57,42,0.10)] ${
                    idx === 0 ? 'aspect-[4/3]' : 'aspect-[16/9]'
                  }`}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.06, ease: EASE }}
                >
                  <img src={img.image} alt={img.title} loading="lazy"
                    className="w-full h-full object-cover" />
                </motion.div>
              ))}

              <div className="pt-2 flex justify-center">
                <Link
                  to="/gallery"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full
                    bg-[#111111] text-white font-bold text-[13px]
                    shadow-[0_4px_18px_rgba(44,57,42,0.25)]"
                >
                  View Complete Gallery <ArrowRight size={14} />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
