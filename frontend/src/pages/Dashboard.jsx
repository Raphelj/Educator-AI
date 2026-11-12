import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import {
  LogOut,
  UploadCloud,
  MessageSquare,
  Send,
  Trash2,
  Plus,
  BookOpen,
  ChevronRight,
  FileText,
  Bot,
  User,
  Sparkles,
  X
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import './markdown-styles.css'
import { API_BASE_URL } from '../apiConfig'

function Dashboard({ onLogout, token }) {
  const [file, setFile] = useState(null)
  const [userDocuments, setUserDocuments] = useState([])
  const [documentId, setDocumentId] = useState(null)
  const [currentDocName, setCurrentDocName] = useState('')
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState(null) // 'processing', 'completed', 'failed'
  const [isUploading, setIsUploading] = useState(false)
  const [question, setQuestion] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [isAsking, setIsAsking] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(null) // document id being deleted

  const messagesEndRef = useRef(null)

  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatHistory, isAsking])

  // 1. Fetch user's existing documents on mount
  const fetchUserDocuments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/documents`, axiosConfig)
      setUserDocuments(res.data)
      if (!documentId && res.data.length > 0) {
        selectDocument(res.data[0].id, res.data[0].filename)
      }
    } catch (err) {
      console.error("Failed to load documents", err)
    }
  }

  useEffect(() => {
    fetchUserDocuments()
  }, [])

  // 2. Select document & load chat history
  const selectDocument = async (id, fallbackName = '') => {
    setDocumentId(id)
    setIsLoadingMessages(true)
    try {
      const docRes = await axios.get(`${API_BASE_URL}/documents/${id}`, axiosConfig)
      setStatus(docRes.data.status)
      setSummary(docRes.data.summary || '')
      setCurrentDocName(docRes.data.filename || fallbackName || `Chat ${id.slice(0, 8)}`)

      const msgRes = await axios.get(`${API_BASE_URL}/documents/${id}/messages`, axiosConfig)
      setChatHistory(msgRes.data)
    } catch (err) {
      console.error("Failed to fetch document history", err)
    } finally {
      setIsLoadingMessages(false)
    }
  }

  // 3. New Chat / Upload view
  const handleNewChat = () => {
    setDocumentId(null)
    setCurrentDocName('')
    setSummary('')
    setStatus(null)
    setChatHistory([])
    setFile(null)
  }

  // 4. Delete a specific document and its conversation
  const handleDeleteChat = async (e, idToDelete) => {
    e.stopPropagation() // Prevent selecting the chat when clicking delete

    if (!window.confirm("Are you sure you want to delete this chat and document?")) {
      return
    }

    setIsDeleting(idToDelete)
    try {
      await axios.delete(`${API_BASE_URL}/documents/${idToDelete}`, axiosConfig)

      // Remove from state list
      const updatedDocs = userDocuments.filter(d => d.id !== idToDelete)
      setUserDocuments(updatedDocs)

      // If we deleted the active document, switch to another or new chat
      if (documentId === idToDelete) {
        if (updatedDocs.length > 0) {
          selectDocument(updatedDocs[0].id, updatedDocs[0].filename)
        } else {
          handleNewChat()
        }
      }
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to delete chat")
    } finally {
      setIsDeleting(null)
    }
  }

  // 5. Polling for processing status
  useEffect(() => {
    let intervalId;
    if (documentId && status === 'processing') {
      intervalId = setInterval(async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/documents/${documentId}`, axiosConfig)
          if (res.data.status === 'completed') {
            setStatus('completed')
            setSummary(res.data.summary || '')
            fetchUserDocuments()
            clearInterval(intervalId)
          } else if (res.data.status.startsWith('failed')) {
            setStatus('failed')
            alert("Background processing failed: " + res.data.status)
            clearInterval(intervalId)
          }
        } catch (err) {
          console.error("Failed to fetch document status", err)
        }
      }, 2000)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [documentId, status])

  // 6. Handle file upload
  const handleFileUpload = async (e) => {
    e.preventDefault()
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          ...axiosConfig.headers,
          'Content-Type': 'multipart/form-data'
        }
      })

      const newDocId = response.data.document_id
      setDocumentId(newDocId)
      setStatus(response.data.status)
      setCurrentDocName(file.name)
      setSummary('')
      setChatHistory([])
      fetchUserDocuments()
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to upload PDF')
    } finally {
      setIsUploading(false)
    }
  }

  // 7. Ask question with optimistic update
  const handleAskQuestion = async (e) => {
    e.preventDefault()
    if (!question.trim() || !documentId) return
    if (status !== 'completed') {
      alert("Please wait until the document finishes processing!")
      return
    }

    const userMsg = question
    setQuestion('')
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }])
    setIsAsking(true)

    try {
      const response = await axios.post(`${API_BASE_URL}/ask`, {
        document_id: documentId,
        question: userMsg
      }, axiosConfig)

      setChatHistory(prev => [...prev, { role: 'ai', content: response.data.answer }])
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'ai', content: 'Sorry, I encountered an error answering that.' }])
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--bg-color)' }}>

      {/* ==================== LEFT SIDEBAR (ChatGPT Style) ==================== */}
      <aside style={{
        width: '280px',
        backgroundColor: '#090d16',
        borderRight: '1px solid var(--surface-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 12px',
        flexShrink: 0
      }}>

        {/* Brand / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 8px 16px 8px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary-accent), #ec4899)',
            borderRadius: '8px',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles size={18} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>Educator AI</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Document Intelligence</span>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--surface-border)',
            color: 'var(--text-main)',
            fontSize: '0.88rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '16px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
        >
          <Plus size={16} />
          <span>New Chat / Upload</span>
        </button>

        {/* Chats Section Label */}
        <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '0 8px 8px 8px' }}>
          Recent Documents
        </div>

        {/* Chat History List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {userDocuments.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>
              No documents yet
            </p>
          ) : (
            userDocuments.map((doc) => {
              const isActive = doc.id === documentId
              return (
                <div
                  key={doc.id}
                  onClick={() => selectDocument(doc.id, doc.filename)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    backgroundColor: isActive ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                    border: isActive ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    group: 'chat-item'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1 }}>
                    <MessageSquare size={15} color={isActive ? 'var(--primary-accent)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                    <span style={{
                      fontSize: '0.83rem',
                      color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontWeight: isActive ? 500 : 400
                    }}>
                      {doc.filename}
                    </span>
                  </div>

                  {/* Delete Button on each chat */}
                  <button
                    title="Delete Chat & Document"
                    onClick={(e) => handleDeleteChat(e, doc.id)}
                    disabled={isDeleting === doc.id}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      opacity: isActive ? 1 : 0.6,
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--error-color)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* User / Logout at Bottom */}
        <div style={{
          borderTop: '1px solid var(--surface-border)',
          paddingTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={15} color="var(--text-muted)" />
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              My Account
            </span>
          </div>
          <button
            onClick={onLogout}
            title="Log out"
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ==================== MAIN CHAT AREA (ChatGPT Style) ==================== */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>

        {/* Top Navbar */}
        <header style={{
          height: '56px',
          borderBottom: '1px solid var(--surface-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 500, margin: 0 }}>
              {currentDocName || "New Conversation"}
            </h3>
            {status && (
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                color: status === 'completed' ? 'var(--success-color)' : '#facc15',
                border: `1px solid ${status === 'completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`
              }}>
                {status === 'completed' ? 'Indexed & Ready' : 'Processing...'}
              </span>
            )}
          </div>

          {summary && (
            <button
              onClick={() => setShowSummaryModal(true)}
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px' }}
            >
              <BookOpen size={14} /> View Document Summary
            </button>
          )}
        </header>

        {/* Message Feed / Welcome Screen */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Empty State / Upload Card when no document is active */}
            {!documentId && (
              <div style={{ textAlign: 'center', margin: '40px auto', maxWidth: '520px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'linear-gradient(135deg, var(--primary-accent), #8b5cf6)',
                  margin: '0 auto 20px auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UploadCloud size={28} color="#fff" />
                </div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '8px' }}>
                  Upload a PDF to Start
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  Educator AI will extract text, build pgvector embeddings, and answer any complex multi-turn questions with tool verification.
                </p>

                <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                  <form onSubmit={handleFileUpload} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setFile(e.target.files[0])}
                      className="premium-input"
                      style={{ padding: '10px' }}
                    />
                    <button type="submit" className="btn-primary" disabled={!file || isUploading} style={{ width: '100%', justifyContent: 'center' }}>
                      <UploadCloud size={18} /> {isUploading ? 'Analyzing...' : 'Upload & Analyze Document'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Processing State */}
            {documentId && status === 'processing' && (
              <div className="glass-card" style={{ padding: '30px', textAlign: 'center', margin: '20px auto', maxWidth: '500px' }}>
                <div className="spinner" style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid rgba(255,255,255,0.1)',
                  borderTopColor: 'var(--primary-accent)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 15px auto'
                }}></div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <h4 style={{ margin: '0 0 6px 0' }}>Analyzing Document in the Background</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  Generating semantic vector chunks and computing executive summary...
                </p>
              </div>
            )}

            {/* Empty Messages State for an Active Document */}
            {documentId && status === 'completed' && chatHistory.length === 0 && (
              <div style={{ textAlign: 'center', margin: '50px auto', maxWidth: '600px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                  margin: '0 auto 16px auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-accent)'
                }}>
                  <Sparkles size={24} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>
                  How can I help you with this document?
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '24px' }}>
                  Ask questions, request summaries, or verify facts. The agent has memory of past answers.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left' }}>
                  {[
                    "What are the main conclusions?",
                    "Summarize the key findings in 3 bullet points",
                    "What methodologies were used?",
                    "Are there any numerical statistics mentioned?"
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setQuestion(suggestion)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--surface-border)',
                        color: 'var(--text-main)',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {chatHistory.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                {msg.role === 'ai' && (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <Bot size={18} color="#fff" />
                  </div>
                )}

                <div style={{
                  maxWidth: '75%',
                  backgroundColor: msg.role === 'user' ? 'var(--primary-accent)' : 'rgba(30, 41, 59, 0.65)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--surface-border)',
                  padding: '12px 18px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  color: 'var(--text-main)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <div className="markdown-container" style={{ fontSize: '0.92rem' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <User size={18} color="var(--text-main)" />
                  </div>
                )}
              </div>
            ))}

            {/* AI Thinking Animation */}
            {isAsking && (
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Bot size={18} color="#fff" />
                </div>
                <div style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.65)',
                  border: '1px solid var(--surface-border)',
                  padding: '12px 18px',
                  borderRadius: '18px 18px 18px 4px',
                  color: 'var(--text-muted)',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Sparkles size={16} color="var(--primary-accent)" />
                  Reasoning through tools & document chunks...
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom Sticky Input Bar (ChatGPT Style) */}
        {documentId && (
          <div style={{
            padding: '16px 20px',
            backgroundColor: 'transparent',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <form
              onSubmit={handleAskQuestion}
              style={{
                width: '100%',
                maxWidth: '800px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={status === 'completed' ? "Ask anything about this document..." : "Waiting for analysis to complete..."}
                disabled={status !== 'completed' || isAsking}
                className="premium-input"
                style={{
                  padding: '14px 50px 14px 18px',
                  borderRadius: '24px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  border: '1px solid var(--surface-border)'
                }}
              />
              <button
                type="submit"
                disabled={!question.trim() || status !== 'completed' || isAsking}
                style={{
                  position: 'absolute',
                  right: '8px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: question.trim() && status === 'completed' && !isAsking ? 'var(--primary-accent)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: question.trim() && status === 'completed' && !isAsking ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.2s'
                }}
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        )}

        {/* ==================== SUMMARY MODAL / DRAWER ==================== */}
        {showSummaryModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}>
            <div className="glass-card" style={{
              width: '100%',
              maxWidth: '700px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              backgroundColor: '#0f172a'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--primary-accent)' }}>
                  <BookOpen size={20} /> Executive Document Summary
                </h3>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                <div className="markdown-container">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {summary}
                  </ReactMarkdown>
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowSummaryModal(false)} className="btn-secondary" style={{ padding: '8px 16px' }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default Dashboard
