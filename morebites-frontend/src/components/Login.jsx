import { useState } from 'react'
import { LuEye, LuEyeOff } from 'react-icons/lu'
import { authApi, setSession } from '../api/client'
import logo from '../assets/logo.png'
import loginBg from '../assets/OVEN.webp'
import './Login.css'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@morebites.com')
  const [password, setPassword] = useState('password')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setEmailError('')
    setPasswordError('')
    setGeneralError('')

    let hasClientError = false
    if (!email.trim()) {
      setEmailError('Email address is required.')
      hasClientError = true
    }
    if (!password) {
      setPasswordError('Password is required.')
      hasClientError = true
    }
    if (hasClientError) return

    setLoading(true)
    try {
      const { data } = await authApi.login(email.trim(), password)
      setSession(data.token, data.user)
      onLogin?.(data.user)
    } catch (err) {
      const errors = err.response?.data?.errors
      if (errors?.email?.[0]) {
        setEmailError(errors.email[0])
      }
      if (errors?.password?.[0]) {
        setPasswordError(errors.password[0])
      }

      if (!errors?.email?.[0] && !errors?.password?.[0]) {
        const msg = err.response?.data?.message || 'Login failed. Please try again.'
        const lower = msg.toLowerCase()
        if (
          lower.includes('account') ||
          lower.includes('user') ||
          lower.includes('found') ||
          lower.includes('email')
        ) {
          setEmailError(msg)
        } else if (lower.includes('password') || lower.includes('credential')) {
          setPasswordError(msg)
        } else {
          setGeneralError(msg)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" style={{ backgroundImage: `url(${loginBg})` }} />
      <div className="login-overlay" />

      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-header">
          <img src={logo} alt="Lynloves morebites Food Corner" className="login-logo" />
          <h1 className="login-title">Start your shift</h1>
          <p className="login-subtitle">Sign in to continue managing the store</p>
        </div>

        {generalError && <div className="login-general-error">{generalError}</div>}

        <div className="login-form">
          <div className="login-field">
            <label className="login-label" htmlFor="login-email">
              Email Address
            </label>
            <input
              id="login-email"
              type="text"
              className={`login-input${emailError ? ' has-error' : ''}`}
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError('')
                if (generalError) setGeneralError('')
              }}
              autoComplete="username"
            />
            {emailError && <span className="login-field-error">{emailError}</span>}
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">
              Password
            </label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className={`login-input login-input-password${passwordError ? ' has-error' : ''}`}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (passwordError) setPasswordError('')
                  if (generalError) setGeneralError('')
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-toggle-password"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <LuEye size={18} /> : <LuEyeOff size={18} />}
              </button>
            </div>
            {passwordError && <span className="login-field-error">{passwordError}</span>}
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </div>
  )
}
