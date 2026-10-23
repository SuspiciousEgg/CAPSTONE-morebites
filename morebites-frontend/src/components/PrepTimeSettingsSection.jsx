import { useCallback, useEffect, useState } from 'react'
import { LuClock, LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
import { storeSettingsApi } from '../api/client'

export default function PrepTimeSettingsSection() {
  const [minTime, setMinTime] = useState(15)
  const [maxTime, setMaxTime] = useState(20)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [updatedBy, setUpdatedBy] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const loadSettings = useCallback(async () => {
    try {
      const res = await storeSettingsApi.getPrepTime()
      const data = res.data?.data || {}
      if (data.min_prep_time != null) setMinTime(Number(data.min_prep_time))
      if (data.max_prep_time != null) setMaxTime(Number(data.max_prep_time))
      if (data.updated_by) setUpdatedBy(data.updated_by)
      if (data.updated_at) setUpdatedAt(data.updated_at)
    } catch (err) {
      console.error('Failed to load store prep settings:', err)
      setError('Failed to load preparation time settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  async function handleSave(e) {
    if (e) e.preventDefault()
    setMessage(null)
    setError(null)

    const min = parseInt(minTime, 10)
    const max = parseInt(maxTime, 10)

    if (isNaN(min) || min < 1) {
      setError('Minimum prep time must be at least 1 minute.')
      return
    }
    if (isNaN(max) || max < 1) {
      setError('Maximum prep time must be at least 1 minute.')
      return
    }
    if (max < min) {
      setError('Maximum prep time cannot be less than minimum prep time.')
      return
    }

    setSaving(true)
    try {
      const res = await storeSettingsApi.updatePrepTime({
        min_prep_time: min,
        max_prep_time: max,
      })
      const data = res.data?.data || {}
      if (data.min_prep_time != null) setMinTime(Number(data.min_prep_time))
      if (data.max_prep_time != null) setMaxTime(Number(data.max_prep_time))
      if (data.updated_by) setUpdatedBy(data.updated_by)
      if (data.updated_at) setUpdatedAt(data.updated_at)
      setMessage(res.data?.message || 'Preparation time updated successfully.')
    } catch (err) {
      console.error('Failed to update prep settings:', err)
      setError(err.response?.data?.message || 'Failed to update preparation time settings.')
    } finally {
      setSaving(false)
    }
  }

  const previewLabel =
    minTime === maxTime
      ? `about ${minTime} mins`
      : `about ${minTime}–${maxTime} mins`

  return (
    <section className="dr-card sa-card" style={{ marginTop: '24px' }}>
      <div className="dr-card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#FFF7ED',
              color: '#EA580C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LuClock size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1C1B18' }}>
              Average Kitchen Preparation Time
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>
              Configurable time estimate shown to customers during <strong>Preparing</strong> status. When dispatched to a rider, this is automatically replaced by live GPS routing.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#15803D',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <LuCircleCheck size={18} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#DC2626',
            fontSize: '13.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <LuTriangleAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ marginTop: '16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '6px',
              }}
            >
              Minimum Prep Time (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="180"
              style={{
                width: '100%',
                height: '42px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                color: '#1C1B18',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
              value={minTime}
              onChange={(e) => setMinTime(e.target.value)}
              disabled={loading || saving}
              required
            />
            <span style={{ fontSize: '11.5px', color: '#888888', marginTop: '4px', display: 'block' }}>
              Lower bound of kitchen prep estimate
            </span>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#374151',
                marginBottom: '6px',
              }}
            >
              Maximum Prep Time (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="180"
              style={{
                width: '100%',
                height: '42px',
                padding: '0 14px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                color: '#1C1B18',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
              value={maxTime}
              onChange={(e) => setMaxTime(e.target.value)}
              disabled={loading || saving}
              required
            />
            <span style={{ fontSize: '11.5px', color: '#888888', marginTop: '4px', display: 'block' }}>
              Upper bound of kitchen prep estimate
            </span>
          </div>
        </div>

        {/* Live Customer Preview */}
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '12px',
            background: '#FFFBF5',
            border: '1px dashed #FDBA74',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#C2410C' }}>
              Customer Order Tracking Preview
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: '#FED7AA',
                color: '#9A3412',
                fontWeight: 600,
              }}
            >
              Estimate (Non-GPS)
            </span>
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1C1B18', marginBottom: '4px' }}>
            Preparing — ready in {previewLabel}
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>
            Shown on the customer app during kitchen preparation. The moment rider pickup is confirmed, this estimate disappears and live GPS route ETA takes over.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {updatedBy && (
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>
                Last updated by {updatedBy}
                {updatedAt ? ` on ${new Date(updatedAt).toLocaleDateString()}` : ''}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="dr-btn-primary"
            disabled={loading || saving}
            style={{ minWidth: '150px' }}
          >
            {saving ? 'Saving…' : 'Save Prep Time'}
          </button>
        </div>
      </form>
    </section>
  )
}

