import { useCallback, useEffect, useState } from 'react'
import { LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
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
      setTimeout(() => setMessage(null), 5000)
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
    <section className="dr-card sa-card prep-time-card">
      <div className="dr-card-head">
        <h2>Average Kitchen Preparation Time</h2>
        <p>
          Configurable time estimate shown to customers during <strong>Preparing</strong> status. When dispatched to a rider, this is automatically replaced by live GPS routing.
        </p>
      </div>

      {message && (
        <div className="loyalty-alert success" role="alert">
          <LuCircleCheck size={18} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="loyalty-alert error" role="alert">
          <LuTriangleAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="prep-time-form">
        <div className="prep-time-grid">
          <div className="loyalty-field">
            <label htmlFor="min-prep-time">
              Minimum Prep Time (minutes)
              <span className="loyalty-help">Lower bound of kitchen prep estimate</span>
            </label>
            <input
              id="min-prep-time"
              type="number"
              min="1"
              max="180"
              value={minTime}
              onChange={(e) => setMinTime(e.target.value)}
              disabled={loading || saving}
              required
            />
          </div>

          <div className="loyalty-field">
            <label htmlFor="max-prep-time">
              Maximum Prep Time (minutes)
              <span className="loyalty-help">Upper bound of kitchen prep estimate</span>
            </label>
            <input
              id="max-prep-time"
              type="number"
              min="1"
              max="180"
              value={maxTime}
              onChange={(e) => setMaxTime(e.target.value)}
              disabled={loading || saving}
              required
            />
          </div>
        </div>

        {/* Live Customer Preview */}
        <div className="prep-preview-card">
          <div className="prep-preview-header">
            <span className="prep-preview-title">Customer Order Tracking Preview</span>
            <span className="prep-preview-pill">Estimate (Non-GPS)</span>
          </div>
          <div className="prep-preview-main">
            Preparing — ready in <strong>{previewLabel}</strong>
          </div>
          <p className="prep-preview-sub">
            Shown on the customer app during kitchen preparation. The moment rider pickup is confirmed, this estimate disappears and live GPS route ETA takes over.
          </p>
        </div>

        <div className="prep-time-footer">
          <div className="prep-time-updated">
            {updatedBy ? (
              <span>
                Last updated by <strong>{updatedBy}</strong>
                {updatedAt ? ` on ${new Date(updatedAt).toLocaleDateString()}` : ''}
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            className="dr-btn-primary"
            disabled={loading || saving}
          >
            {saving ? 'Saving…' : 'Save Prep Time'}
          </button>
        </div>
      </form>
    </section>
  )
}
