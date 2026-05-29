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
            // Check for OAuth callback in hash
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-8">Twillo Portal</h1>
          <button
            onClick={signIn}
            className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/80 transition"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 bg-primary text-white px-4 py-2 rounded-lg z-50">
          {toast}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-background border border-border rounded-lg p-6 w-96 max-w-full">
            <h2 className="text-xl font-bold mb-4">Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block mb-1">Forward Number</label>
                <input
                  type="tel"
                  value={settings?.forward_to || ''}
                  onChange={(e) => updateSettings({ forward_to: e.target.value })}
                  className="w-full bg-background border border-border rounded px-3 py-2"
                  placeholder="+1234567890"
                />
              </div>
              <div>
                <label className="block mb-1">Call Mode</label>
                <select
                  value={settings?.call_mode || 'forward'}
                  onChange={(e) => updateSettings({ call_mode: e.target.value as 'browser' | 'forward' })}
                  className="w-full bg-background border border-border rounded px-3 py-2"
                >
                  <option value="forward">Forward Mode</option>
                  <option value="browser">Browser Mode</option>
                </select>
              </div>
              <div>
                <label className="block mb-1">Theme</label>
                <select
                  value={theme}
                  onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
                  className="w-full bg-background border border-border rounded px-3 py-2"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 bg-primary text-white px-4 py-2 rounded hover:bg-primary/80 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main App */}
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-background/50 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">Twillo Portal</h1>
            <button
              onClick={signOut}
              className="text-sm text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>

          {/* Balance */}
          {balance && (
            <div className="mb-6 p-3 bg-background border border-border rounded">
              <div className="text-sm text-muted">Balance</div>
              <div className="font-bold">{balance.currency} {balance.balance}</div>
            </div>
          )}

          {/* Numbers */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Numbers</h2>
              <button
                onClick={() => setShowBuyNumber(true)}
                className="text-xs bg-primary text-white px-2 py-1 rounded hover:bg-primary/80"
              >
                Buy Number
              </button>
            </div>
            <div className="space-y-2">
              {numbers.map((num) => (
                <div
                  key={num.sid}
                  className={`p-2 rounded cursor-pointer transition ${
                    selectedNumber === num.phone_number
                      ? 'bg-primary text-white'
                      : 'bg-background border border-border hover:bg-background/80'
                  }`}
                  onClick={() => {
                    setSelectedNumber(num.phone_number)
                    if (supabase) loadMessages(supabase)
                  }}
                >
                  <div className="font-mono text-sm">{num.phone_number}</div>
                  <div className="text-xs text-muted truncate">{num.friendly_name}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      releaseNumber(num.sid)
                    }}
                    className="text-xs text-red-500 hover:text-red-400 mt-1"
                  >
                    Release
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="w-full bg-background border border-border px-4 py-2 rounded hover:bg-background/80 transition"
          >
            Settings
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Top Bar */}
          <div className="border-b border-border p-4 flex items-center justify-between">
            <h2 className="font-bold text-lg">
              {selectedNumber || 'Select a number'}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('messages')}
                className={`px-4 py-2 rounded transition ${
                  activeTab === 'messages'
                    ? 'bg-primary text-white'
                    : 'bg-background border border-border hover:bg-background/80'
                }`}
              >
                Messages
              </button>
              <button
                onClick={() => setActiveTab('calls')}
                className={`px-4 py-2 rounded transition ${
                  activeTab === 'calls'
                    ? 'bg-primary text-white'
                    : 'bg-background border border-border hover:bg-background/80'
                }`}
              >
                Calls
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'messages' ? (
              <div className="max-w-2xl mx-auto">
                {/* New Message */}
                <div className="mb-6 p-4 bg-background border border-border rounded">
                  <h3 className="font-semibold mb-3">Send Message</h3>
                  <div className="space-y-3">
                    <input
                      type="tel"
                      value={newMessageTo}
                      onChange={(e) => setNewMessageTo(e.target.value)}
                      placeholder="To"
                      className="w-full bg-background/50 border border-border rounded px-3 py-2"
                    />
                    <textarea
                      value={newMessageBody}
                      onChange={(e) => setNewMessageBody(e.target.value)}
                      placeholder="Message"
                      rows={3}
                      className="w-full bg-background/50 border border-border rounded px-3 py-2"
                    />
                    <button
                      onClick={sendMessage}
                      className="bg-primary text-white px-4 py-2 rounded hover:bg-primary/80 transition"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {/* Messages List */}
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.message_sid}
                      className={`p-3 rounded ${
                        msg.direction === 'outbound'
                          ? 'bg-primary/10 ml-8'
                          : 'bg-background/50 mr-8'
                      }`}
                    >
                      <div className="text-xs text-muted mb-1">
                        {msg.direction === 'outbound' ? 'To' : 'From'}:{' '}
                        {msg.direction === 'outbound' ? msg.to_number : msg.from_number}
                      </div>
                      <div className="whitespace-pre-wrap">{msg.body}</div>
                      <div className="text-xs text-muted mt-1">
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted">
                Call history coming soon
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
