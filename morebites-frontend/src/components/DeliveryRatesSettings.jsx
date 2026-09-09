import { useCallback, useEffect, useState } from 'react'
import { LuPencil, LuX, LuCalculator } from 'react-icons/lu'
import { IconClose, IconEdit } from './Icons'
import { deliveryRatesApi } from '../api/client'
import './DeliveryRatesSettings.css'

const EMPTY = {
  fee: '',
  active: true,
}

export default function DeliveryRatesSettings() {
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [quoteKm, setQuoteKm] = useState('3')
  const [quote, setQuote] = useState(null)

  const reload = useCallback(async () => {
    const r = await deliveryRatesApi.list()
    setRates(r.data?.data || r.data || [])
  }, [])

  useEffect(() => {
    reload()
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [reload])

  useEffect(() => {
    const km = Number(quoteKm)
    if (!Number.isFinite(km) || km < 0) {
      setQuote(null)
      return
    }
    deliveryRatesApi
      .quote(km)
      .then((res) => setQuote(res.data?.data || res.data))
      .catch(() => setQuote(null))
  }, [quoteKm, rates])

  function openEdit(rate) {
    setForm({
      fee: String(rate.fee ?? ''),
      active: rate.active !== false,
    })
    setModal(rate)
  }

  async function save() {
    const fee = Number(form.fee)
    if (!Number.isFinite(fee) || fee < 0) {
      alert('Enter a valid delivery fee.')
      return
    }

    setSaving(true)
    try {
      await deliveryRatesApi.update(modal.id, {
        fee,
        active: Boolean(form.active),
      })
      setModal(null)
      await reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dr-page">
      <header className="dr-header">
        <div>
          <h1>Settings</h1>
          <p className="dr-sub">Delivery rate table — distance-based pricing tiers</p>
        </div>
      </header>

      <section className="dr-card sa-card">
        <div className="dr-card-head">
          <h2>Delivery Rate Table</h2>
          <p>
            Five fixed distance ranges from the store. You can update the delivery fee and active status for each tier.
          </p>
        </div>

        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Distance Range</th>
                <th>Min (km)</th>
                <th>Max (km)</th>
                <th>Delivery Fee</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="dr-empty">
                    Loading…
                  </td>
                </tr>
              ) : (
                rates.map((rate) => (
                  <tr key={rate.id}>
                    <td className="dr-label">{rate.label}</td>
                    <td>{rate.min_km}</td>
                    <td>{rate.max_km == null ? '∞' : rate.max_km}</td>
                    <td className="dr-fee">{rate.fee_label}</td>
                    <td>
                      <span className={`dr-badge ${rate.active ? 'on' : 'off'}`}>
                        {rate.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="dr-actions">
                        <button type="button" className="dr-icon" aria-label="Edit fee" onClick={() => openEdit(rate)}>
                          <LuPencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dr-card sa-card dr-preview">
        <h2>Fee Preview</h2>
        <p>Test which tier applies for a given distance.</p>
        <label className="dr-preview-field">
          Distance (km)
          <input
            type="number"
            min="0"
            step="0.1"
            value={quoteKm}
            onChange={(e) => setQuoteKm(e.target.value)}
          />
        </label>
        {quote ? (
          <div className="dr-quote-wrap">
            <p className="dr-formula">{quote.formula}</p>
            <ol className="dr-calc">
              {(quote.calculation || []).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="dr-quote">
              <div>
                <span>Tier</span>
                <strong>{quote.tier_label || 'Default'}</strong>
              </div>
              <div>
                <span>Delivery fee</span>
                <strong>₱{Number(quote.delivery_fee).toFixed(2)}</strong>
              </div>
              <div>
                <span>Service fee</span>
                <strong>₱{Number(quote.service_fee).toFixed(2)}</strong>
              </div>
              <div>
                <span>Total fees</span>
                <strong>₱{Number(quote.fees_total).toFixed(2)}</strong>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {modal && (
        <div className="dr-backdrop" onClick={() => setModal(null)} role="presentation">
          <div className="dr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="dr-modal-head">
              <h2>Edit delivery fee</h2>
              <button type="button" className="dr-modal-close-circle" onClick={() => setModal(null)} aria-label="Close">
                <LuX size={18} />
              </button>
            </div>
            <div className="dr-modal-body">
              <p className="dr-fixed-range">
                Distance range: <strong>{modal.label}</strong>
              </p>
              <label>
                Delivery fee (₱)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fee}
                  onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                />
              </label>
              <label className="dr-check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="dr-modal-foot">
              <button type="button" className="dr-btn-cancel" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="dr-btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save Fee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
