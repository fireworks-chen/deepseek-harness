import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { LoaderCircle, ShieldCheck, Smartphone } from 'lucide-react'
import type { DesktopBootstrap } from '../contracts.ts'

export function LoginApp() {
  const [bootstrap, setBootstrap] = useState<DesktopBootstrap>()
  const [phone, setPhone] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [requestingCode, setRequestingCode] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void window.desktop.bootstrap().then((value) => {
      setBootstrap(value)
      document.title = value.brand.productName
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }, [])

  useEffect(() => {
    if (codeCooldown <= 0) return
    const timer = window.setTimeout(() => {
      setCodeCooldown(current => Math.max(0, current - 1))
    }, 1000)
    return () => { window.clearTimeout(timer) }
  }, [codeCooldown])

  const requestVerificationCode = async (): Promise<void> => {
    if (requestingCode || codeCooldown > 0) return
    if (phone.trim() === '') {
      setError('请输入手机号')
      return
    }
    setRequestingCode(true)
    setError(undefined)
    try {
      const result = await window.desktop.requestVerificationCode(phone)
      if (result.ok) setCodeCooldown(result.retryAfterSeconds)
      else setError(result.message)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRequestingCode(false)
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (submitting) return
    if (phone.trim() === '' || verificationCode.trim() === '') {
      setError('请输入手机号和验证码')
      return
    }
    setSubmitting(true)
    setError(undefined)
    try {
      const result = await window.desktop.login({
        phone,
        verificationCode,
        remember: true,
      })
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
  const codeButtonLabel = codeCooldown > 0
    ? `${codeCooldown} 秒后重试`
    : requestingCode ? '正在获取...' : '获取验证码'

  return (
    <main className="login-shell" style={{ '--brand-accent': brand.accentColor } as CSSProperties}>
      <div className="window-drag-region" />
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-heading">
          <h1 id="login-title">
            <span>欢迎</span>
            <span className="login-heading-accent">登录用户端</span>
          </h1>
          <p>要出海·有货就能出海</p>
        </header>

        <form className="login-form" onSubmit={(event) => { void submit(event) }}>
          <div className="field-group">
            <label className="field-label" htmlFor="phone">手机号</label>
            <div className="input-shell">
              <Smartphone size={18} aria-hidden="true" />
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="请输入手机号"
                value={phone}
                onChange={(event) => { setPhone(event.target.value) }}
                disabled={submitting}
                required
              />
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="verification-code">验证码</label>
            <div className="input-shell code-input-shell">
              <ShieldCheck size={18} aria-hidden="true" />
              <input
                id="verification-code"
                name="verificationCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="请输入验证码"
                value={verificationCode}
                onChange={(event) => { setVerificationCode(event.target.value) }}
                disabled={submitting}
                required
              />
              <button
                className="code-button"
                type="button"
                disabled={requestingCode || codeCooldown > 0 || submitting}
                aria-label={codeButtonLabel}
                onClick={() => { void requestVerificationCode() }}
              >
                {codeButtonLabel}
              </button>
            </div>
          </div>

          <p className="agreement-copy">
            <span>登录即代表同意</span>
            <a href={brand.userAgreementUrl} target="_blank" rel="noreferrer">《服务条款》</a>
            <span>和</span>
            <a href={brand.privacyPolicyUrl} target="_blank" rel="noreferrer">《隐私政策》</a>
          </p>

          <div className="error-slot" aria-live="polite">
            {error === undefined ? null : <p role="alert">{error}</p>}
          </div>

          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting && <LoaderCircle className="spinner" size={18} aria-hidden="true" />}
            <span>{submitting ? '正在登录...' : '登录'}</span>
          </button>
        </form>
      </section>
    </main>
  )
}
