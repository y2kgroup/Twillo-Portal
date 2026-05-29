'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

interface User {
  id: string
  email: string
}

interface Number {
  sid: string
  phone_number: string
  friendly_name: string
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
  }
}

interface Message {
  message_sid: string
  from_number: string
  to_number: string
  body: string
  direction: 'inbound' | 'outbound'
  status: string
  created_at: string
}

interface Settings {
  user_email: string
  forward_to?: string
  call_mode?: 'browser' | 'forward'
  default_caller_id?: string
  theme?: 'dark' | 'light'
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [numbers, setNumbers] = useState<Number[]>([])
  const [selectedNumber, setSelectedNumber] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [balance, setBalance] = useState<{ balance: string; currency: string } | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [activeTab, setActiveTab] = useState<'messages' | 'calls'>('messages')
  const [showSettings, setShowSettings] = useState(false)
  const [showBuyNumber, setShowBuyNumber] = useState(false)
  const [newMessageTo, setNewMessageTo] = useState('')
  const [newMessageBody, setNewMessageBody] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [supabase, setSupabase] = useState<any>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Initialize Supabase and check auth
  useEffect(() => {
    const initSupabase = async () => {
      try {
        const configRes = await fetch('/api/public-config')
        const config = await configRes.json()

        if (config.supabaseUrl && config.supabaseAnonKey) {
          const client = createClient(config.supabaseUrl, config.supabaseAnonKey)
          setSupabase(client)

          // Check for existing session
          const { data: { session } } = await client.auth.getSession()
          if (session?.user) {
            setUser({ id: session.user.id, email: session.user.email || '' })
            await loadUserData(session.user.email || '', client)
          } else {
            // Check for token from hash
            const hash = window.location.hash
            const params = new URLSearchParams(hash.substring(1))
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')

            if (accessToken && refreshToken) {
              const { data: { session: newSession } } = await client.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })
              if (newSession?.user) {
                setUser({ id: newSession.user.id, email: newSession.user.email || '' })
                await loadUserData(newSession.user.email || '', client)
                window.location.hash = ''
              }
            }
          }

          // Listen for auth changes
          const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
              setUser({ id: session.user.id, email: session.user.email || '' })
              await loadUserData(session.user.email || '', client)
            } else {
              setUser(null)
            }
          })

          return () => subscription.unsubscribe()
        }
      } catch (error) {
        console.error('Supabase init error:', error)
      } finally {
        setLoading(false)
      }
    }

    initSupabase()
  }, [])

  // Load user data
  const loadUserData = async (email: string, client: any) => {
    try {
      // Get session token
      const { data: { session } } = await client.auth.getSession()
      const token = session?.access_token

      if (!token) return

      // Load numbers
      const numbersRes = await fetch('/api/numbers', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (numbersRes.ok) {
        const numbersData = await numbersRes.json()
        setNumbers(numbersData)
        if (numbersData.length > 0) {
          setSelectedNumber(numbersData[0].phone_number)
        }
      }

      // Load balance
      const balanceRes = await fetch('/api/balance', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (balanceRes.ok) {
        const balanceData = await balanceRes.json()
        setBalance(balanceData)
      }

      // Load settings
      const settingsRes = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        setSettings(settingsData)
        setTheme(settingsData.theme || 'dark')
      }

      // Load messages
      loadMessages(client)
    } catch (error) {
      console.error('Error loading user data:', error)
    }
  }

  // Load messages for selected number
  const loadMessages = async (client: any) => {
    if (!selectedNumber || !client) return

    try {
      const token = (await client.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/messages?number=${encodeURIComponent(selectedNumber)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  // Sign in with Google
  const signIn = async () => {
    if (!supabase) {
      showToast('Authentication not configured')
      return
    }

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })

      if (error) {
        console.error('OAuth error:', error)
        showToast('Failed to sign in')
      }
    } catch (error) {
      console.error('Sign in error:', error)
      showToast('Failed to sign in')
    }
  }

  // Sign out
  const signOut = () => {
    if (!supabase) return
    supabase.auth.signOut()
    setUser(null)
    setNumbers([])
    setMessages([])
    setBalance(null)
    setSettings(null)
  }

  // Show toast
  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  // Send message
  const sendMessage = async () => {
    console.log('Send button clicked!')
    console.log('Selected number:', selectedNumber)
    console.log('To:', newMessageTo)
    console.log('Body:', newMessageBody)
    console.log('Has supabase:', !!supabase)

    if (!newMessageTo || !newMessageBody || !supabase) {
      showToast('Please fill in all fields')
      return
    }

    if (!selectedNumber) {
      showToast('Please select a phone number first')
      return
    }

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          from: selectedNumber,
          to: newMessageTo,
          body: newMessageBody
        })
      })

      if (res.ok) {
        showToast('Message sent!')
        setNewMessageTo('')
        setNewMessageBody('')
        loadMessages(supabase)
      } else {
        const errorData = await res.json()
        console.error('Send message error:', errorData)
        showToast(`Failed to send message: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error sending message:', error)
      showToast('Failed to send message')
    }
  }

  // Update settings
  const updateSettings = async (newSettings: Partial<Settings>) => {
    if (!supabase) return

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...settings, ...newSettings })
      })

      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        setTheme(data.theme || 'dark')
        showToast('Settings saved!')
      }
    } catch (error) {
      console.error('Error updating settings:', error)
      showToast('Failed to save settings')
    }
  }

  // Release number
  const releaseNumber = async (sid: string) => {
    if (!supabase) return

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/numbers?sid=${sid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        showToast('Number released')
        loadUserData(user?.email || '', supabase)
      } else {
        showToast('Failed to release number')
      }
    } catch (error) {
      console.error('Error releasing number:', error)
      showToast('Failed to release number')
    }
  }

  // Apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <div className="text-foreground-muted">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-surface rounded-2xl shadow-xl p-8 border border-border">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">Twillo Portal</h1>
              <p className="text-foreground-muted">Manage your Twilio account</p>
            </div>
            <button
              onClick={signIn}
              className="w-full bg-primary hover:bg-primary-hover text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M5.26 9.76c-.29.98-.95 1.69-1.63 2.66-.91v3.31h7.08c-.06-.47-.36-1.36-.89-2.59H5.26z" fill="#34A853"/>
                <path d="M12 5.48c1.66 0 3.18.25 4.61.66V12h7.07c-.53-4.69-3.5-8.25-7.39-8.25-1.66 0-3.18.25-4.61.66z" fill="#FBBC05"/>
                <path d="M5.26 14.24c.29.98.95 1.69 1.63 2.66.91v3.31H12c-.06-.47-.36-1.36-.89-2.59l-3.85-5.62z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-surface border border-border text-foreground px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary"></div>
            {toast}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-foreground-muted hover:text-foreground transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Forward Number</label>
                <input
                  type="tel"
                  value={settings?.forward_to || ''}
                  onChange={(e) => updateSettings({ forward_to: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  placeholder="+1234567890"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Call Mode</label>
                <select
                  value={settings?.call_mode || 'forward'}
                  onChange={(e) => updateSettings({ call_mode: e.target.value as 'browser' | 'forward' })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="forward">Forward Mode</option>
                  <option value="browser">Browser Mode</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Theme</label>
                <select
                  value={theme}
                  onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
                  className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-40">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="bg-surface border border-border p-2 rounded-lg"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Main App */}
      <div className="flex flex-col lg:flex-row min-h-screen">
        {/* Sidebar */}
        <div className={`${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static inset-y-0 left-0 w-72 bg-surface border-r border-border z-30 transition-transform duration-300 ease-out`}>
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-border">
              <h1 className="text-2xl font-bold text-foreground mb-6">Twillo Portal</h1>

              {/* Balance */}
              {balance && (
                <div className="bg-gradient-to-br from-primary/20 to-accent/20 border border-border rounded-xl p-4">
                  <div className="text-sm text-foreground-muted mb-1">Balance</div>
                  <div className="text-2xl font-bold text-foreground">{balance.currency} {balance.balance}</div>
                </div>
              )}
            </div>

            {/* Numbers */}
            <div className="flex-1 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wide mb-4">Your Numbers</h2>
              <div className="space-y-2">
                {numbers.map((num) => (
                  <div
                    key={num.sid}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                      selectedNumber === num.phone_number
                        ? 'bg-primary border-primary text-white shadow-lg'
                        : 'bg-background border-border hover:border-primary hover:shadow-md'
                    }`}
                    onClick={() => {
                      setSelectedNumber(num.phone_number)
                      if (supabase) {
                        loadMessages(supabase)
                        setMobileMenuOpen(false)
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono text-lg font-semibold">{num.phone_number}</div>
                      {selectedNumber === num.phone_number && (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="text-sm opacity-80 truncate">{num.friendly_name}</div>
                    <div className="flex gap-2 mt-2">
                      {num.capabilities.sms && (
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/20 border border-primary/30">SMS</span>
                      )}
                      {num.capabilities.voice && (
                        <span className="text-xs px-2 py-1 rounded-full bg-accent/20 border border-accent/30">Voice</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Settings Button */}
              <button
                onClick={() => {
                  setShowSettings(true)
                  setMobileMenuOpen(false)
                }}
                className="w-full bg-surface border border-border hover:border-primary text-foreground font-medium py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756 2.924 1.756 3.35 0 1.724-1.756 1.724-2.924 0-3.35a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 001.065-2.572c-.426-1.756-2.924-1.756-3.35 0-1.724 1.756-1.724 2.924 0 3.35a1.724 1.724 0 002.573 1.066c1.543-.94 3.31-.826 2.37-2.37a1.724 1.724 0 001.066 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065z" />
                </svg>
                Settings
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => {
                  signOut()
                  setMobileMenuOpen(false)
                }}
                className="w-full text-foreground-muted hover:text-foreground text-sm font-medium transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Overlay for mobile menu */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:static">
          {/* Top Bar */}
          <div className="lg:hidden border-b border-border p-4">
            <div className="text-lg font-semibold text-foreground">
              {selectedNumber || 'Select a number'}
            </div>
          </div>

          <div className="lg:hidden border-b border-border bg-surface">
            <div className="flex overflow-x-auto">
              <button
                onClick={() => setActiveTab('messages')}
                className={`flex-1 py-3 px-4 text-center font-medium transition-colors border-b-2 ${
                  activeTab === 'messages'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-foreground-muted'
                }`}
              >
                Messages
              </button>
              <button
                onClick={() => setActiveTab('calls')}
                className={`flex-1 py-3 px-4 text-center font-medium transition-colors border-b-2 ${
                  activeTab === 'calls'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-foreground-muted'
                }`}
              >
                Calls
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="max-w-4xl mx-auto">
              {/* Desktop Tabs */}
              <div className="hidden lg:flex mb-6 bg-surface border border-border rounded-xl p-1">
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                    activeTab === 'messages'
                      ? 'bg-primary text-white shadow-md'
                      : 'text-foreground-muted hover:text-foreground hover:bg-background'
                  }`}
                >
                  Messages
                </button>
                <button
                  onClick={() => setActiveTab('calls')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
                    activeTab === 'calls'
                      ? 'bg-primary text-white shadow-md'
                      : 'text-foreground-muted hover:text-foreground hover:bg-background'
                  }`}
                >
                  Calls
                </button>
              </div>

              {activeTab === 'messages' ? (
                <div className="space-y-6">
                  {/* Selected Number Info */}
                  <div className="bg-gradient-to-br from-primary/10 to-accent/10 border border-border rounded-xl p-4">
                    <div className="text-sm text-foreground-muted mb-1">Selected Number</div>
                    <div className="text-xl font-bold text-foreground">{selectedNumber || 'None selected'}</div>
                  </div>

                  {/* New Message */}
                  <div className="bg-surface border border-border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Send Message</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground-muted mb-2">To</label>
                        <input
                          type="tel"
                          value={newMessageTo}
                          onChange={(e) => setNewMessageTo(e.target.value)}
                          placeholder="+1234567890"
                          className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground-muted mb-2">Message</label>
                        <textarea
                          value={newMessageBody}
                          onChange={(e) => setNewMessageBody(e.target.value)}
                          placeholder="Type your message..."
                          rows={3}
                          className="w-full bg-background border border-border rounded-lg px-4 py-3 text-foreground focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none"
                        />
                      </div>
                      <button
                        onClick={sendMessage}
                        className="w-full bg-primary hover:bg-primary-hover text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18 9 18-9-2-9 2z" />
                        </svg>
                        Send Message
                      </button>
                    </div>
                  </div>

                  {/* Messages List */}
                  <div className="bg-surface border border-border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Messages</h3>
                    {messages.length === 0 ? (
                      <div className="text-center text-foreground-muted py-8">
                        No messages yet
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((msg) => (
                          <div
                            key={msg.message_sid}
                            className={`p-4 rounded-xl transition-all duration-200 ${
                              msg.direction === 'outbound'
                                ? 'bg-gradient-to-br from-primary/10 to-primary/5 ml-8 border border-primary/20'
                                : 'bg-gradient-to-br from-accent/10 to-accent/5 mr-8 border border-accent/20'
                            }`}
                          >
                            <div className="text-xs text-foreground-muted mb-1">
                              {msg.direction === 'outbound' ? 'To' : 'From'}:{' '}
                              {msg.direction === 'outbound' ? msg.to_number : msg.from_number}
                            </div>
                            <div className="text-foreground whitespace-pre-wrap break-words">{msg.body}</div>
                            <div className="text-xs text-foreground-muted mt-2">
                              {new Date(msg.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-surface border border-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Call History</h3>
                  <div className="text-center text-foreground-muted py-8">
                    Call history coming soon
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
