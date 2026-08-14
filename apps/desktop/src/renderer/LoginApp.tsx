import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import type { DesktopBootstrap } from '../contracts.ts'

export function LoginApp() {
  const [bootstrap, setBootstrap] = useState<DesktopBootstrap>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void window.desktop.bootstrap().then((value) => {
      setBootstrap(value)
      setEmail(value.brand.demoEmail)
      setPassword(value.brand.demoPassword)
      document.title = value.brand.productName
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(undefined)
    try {
      const result = await window.desktop.login({ email, password, remember })
      if (!result.ok) setError(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  if (bootstrap === undefined) {
    return (
      <main className="loading-shell" aria-label="正在加载">
        <LoaderCircle className="spinner" size={24} aria-hidden="true" />
      </main>
    )
  }

  const { brand } = bootstrap
  return (
    <main className="login-shell" style={{ '--brand-accent': brand.accentColor } as CSSProperties}>
      <div className="window-drag-region" />
      <section className="login-panel" aria-labelledby="login-title">
        <header className="brand-header">
          <img className="brand-logo" src={brand.logoDataUrl} alt="" />
          <div>
            <p className="product-name">{brand.displayName}</p>
            <p className="tagline">{brand.tagline}</p>
          </div>
        </header>

        <div className="login-heading">
          <h1 id="login-title">欢迎回来</h1>
          <p>登录后继续你的工作</p>
        </div>

        <form onSubmit={(event) => { void submit(event) }}>
          <label className="field-label" htmlFor="email">邮箱</label>
          <div className="input-shell">
            <Mail size={18} aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => { setEmail(event.target.value) }}
              disabled={submitting}
              required
            />
          </div>

          <label className="field-label" htmlFor="password">密码</label>
          <div className="input-shell">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => { setPassword(event.target.value) }}
              disabled={submitting}
              required
            />
            <button
              className="icon-button"
              type="button"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              title={showPassword ? '隐藏密码' : '显示密码'}
              onClick={() => { setShowPassword(current => !current) }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => { setRemember(event.target.checked) }}
            />
            <span>保持登录状态</span>
          </label>

          <div className="error-slot" aria-live="polite">
            {error === undefined ? null : <p role="alert">{error}</p>}
          </div>

          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="spinner" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
            <span>{submitting ? '正在进入...' : '登录'}</span>
          </button>
        </form>

        <footer className="mock-note">
          <span>本地模拟登录</span>
          <span>{brand.demoEmail}</span>
        </footer>
      </section>
    </main>
  )
}
