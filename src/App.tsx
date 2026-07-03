import React, { useState, useEffect, useRef } from 'react';
import { Settings, Mic, BookOpen, Save, Play, StopCircle, RefreshCw, UploadCloud, Check, AlertCircle, FileText, ExternalLink, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { googleSignIn, googleSignOut, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<'journal' | 'synthesis' | 'settings'>('journal');
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Monitor Firebase Auth state change to gracefully preserve sessions
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserEmail(user.email);
      } else {
        setUserEmail(null);
        setGoogleToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const [alertMessage, setAlertMessage] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);

  const triggerAlert = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setAlertMessage({ message, type });
    setTimeout(() => {
      setAlertMessage(null);
    }, 5000);
  };

  const handleLinkGoogle = async () => {
    try {
      const { user, accessToken, email } = await googleSignIn();
      if (accessToken) {
        setGoogleToken(accessToken);
        setUserEmail(email || 'Connected Google Account');
        triggerAlert("Successfully linked with Google Drive!", "success");
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.message?.includes('popup-closed-by-user')) {
        triggerAlert("Linkage cancelled: The login popup was closed.", "info");
      } else {
        triggerAlert("Google linking failed: " + (err.message || err), "error");
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await googleSignOut();
      setGoogleToken(null);
      setUserEmail(null);
    } catch (err: any) {
      console.error("Disconnect error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#141412] text-[#C5BDB0] font-serif selection:bg-[#3D2222] selection:text-[#EAE5DB]">
      {/* Toast Notification */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 border rounded shadow-2xl font-sans text-xs tracking-wider uppercase"
            style={{
              backgroundColor: alertMessage.type === 'error' ? '#211414' : alertMessage.type === 'success' ? '#142114' : '#1C1C1A',
              borderColor: alertMessage.type === 'error' ? '#802829' : alertMessage.type === 'success' ? '#288029' : '#2D2D2A',
              color: alertMessage.type === 'error' ? '#E98080' : alertMessage.type === 'success' ? '#80E980' : '#C5BDB0',
            }}
          >
            {alertMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-[#802829]" />}
            {alertMessage.type === 'success' && <Check className="w-4 h-4 text-[#288029]" />}
            <span>{alertMessage.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upper Navigation Header */}
      <nav className="border-b border-[#2D2D2A] bg-[#0E0E0D] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <h1 className="text-2xl tracking-tight text-[#802829] flex items-center gap-3 font-serif">
            <BookOpen className="w-6 h-6 text-[#802829]" />
            <span>My Story</span>
          </h1>
          <div className="flex space-x-2">
            <NavButton active={activeTab === 'journal'} onClick={() => setActiveTab('journal')} icon={<Mic className="w-4 h-4" />}>
              Vault
            </NavButton>
            <NavButton active={activeTab === 'synthesis'} onClick={() => setActiveTab('synthesis')} icon={<RefreshCw className="w-4 h-4" />}>
              Synthesis
            </NavButton>
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings className="w-4 h-4" />}>
              Settings
            </NavButton>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <AnimatePresence mode="wait">
          {activeTab === 'journal' && (
            <JournalRoom 
              key="journal" 
              googleToken={googleToken} 
              userEmail={userEmail}
              onLinkGoogle={handleLinkGoogle}
              onDisconnect={handleDisconnect}
              triggerAlert={triggerAlert}
            />
          )}
          {activeTab === 'synthesis' && (
            <SynthesisStudio 
              key="synthesis" 
              googleToken={googleToken} 
            />
          )}
          {activeTab === 'settings' && (
            <SettingsCenter 
              key="settings" 
              googleToken={googleToken} 
              userEmail={userEmail}
              onLinkGoogle={handleLinkGoogle}
              onDisconnect={handleDisconnect}
              triggerAlert={triggerAlert}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded font-sans text-[11px] uppercase tracking-widest transition-all duration-300 ${
        active 
          ? 'bg-[#211414] text-[#802829] border border-[#802829]/40' 
          : 'text-[#8B8B7A] hover:text-[#C5BDB0] hover:bg-[#1E1E1C]'
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

interface JournalRoomProps {
  googleToken: string | null;
  userEmail: string | null;
  onLinkGoogle: () => any;
  onDisconnect: () => any;
  triggerAlert: (msg: string, type?: 'info' | 'error' | 'success') => void;
  key?: string;
}

function JournalRoom({ googleToken, userEmail, onLinkGoogle, onDisconnect, triggerAlert }: JournalRoomProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [language, setLanguage] = useState('auto');
  const [model, setModel] = useState('gemini-2.5-flash-audio');
  const [detectedTags, setDetectedTags] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveLink, setArchiveLink] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Debounced real-time Gemini Therapy-Speak Tagging
  useEffect(() => {
    if (!transcript.trim() || transcript.length < 10) {
      setDetectedTags([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/journal/analyze-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript })
        });
        const data = await res.json();
        if (data.tags && data.tags.length > 0) {
          setDetectedTags(data.tags);
        }
      } catch (e) {
        console.error("Failed to fetch therapy tags:", e);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [transcript]);

  // Connect backend WebSocket for live chat opinion triggers
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsRef.current = new WebSocket(`${protocol}//${window.location.host}/ws/journal`);
    
    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'audio_response') {
          setAiResponse(data.text);
        }
      } catch (e) {
        console.error("WS parsing error:", e);
      }
    };
    
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Web Speech API + Robust MediaRecorder Gemini Audio Transcription pipeline
  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      
      // 1. Stop SpeechRecognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }

      // 2. Stop MediaRecorder to trigger transcription
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } else {
      try {
        // Request microphone permission and initialize audio stream
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error("Microphone permission error:", err);
        triggerAlert("Microphone permission is blocked. Click the 'Open in new tab' button at the top right of your preview pane so the browser can prompt for microphone permissions directly.", "error");
        return;
      }

      setIsRecording(true);
      setTranscript("Recording started... Speak now. Greek & English are fully supported.");
      audioChunksRef.current = [];

      // A. Setup Speech Recognition for fast interim text on screen
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        if (language !== 'auto') {
          recognitionRef.current.lang = language === 'el' ? 'el-GR' : 'en-US';
        }

        recognitionRef.current.onresult = (event: any) => {
          let finalResult = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalResult += event.results[i][0].transcript;
            }
          }
          if (finalResult) {
            setTranscript(prev => {
              if (prev.startsWith("Recording started...") || prev.startsWith("Processing high-quality transcription")) {
                return finalResult.trim();
              }
              const cleanedPrev = prev.trim();
              const cleanedNew = finalResult.trim();
              if (cleanedPrev.endsWith(cleanedNew)) return prev;
              return cleanedPrev ? cleanedPrev + ' ' + cleanedNew : cleanedNew;
            });
          }
        };

        recognitionRef.current.onerror = (e: any) => {
          console.error("Speech Recognition Error:", e.error);
        };

        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error("SpeechRecognition start error:", e);
        }
      }

      // B. Setup MediaRecorder for robust background high-quality audio capture
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          if (audioBlob.size > 1000) {
            setTranscript("Processing high-quality transcription with Gemini...");
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');

            try {
              const res = await fetch('/api/journal/transcribe-audio', {
                method: 'POST',
                body: formData
              });
              const data = await res.json();
              if (data.success && data.transcript) {
                setTranscript(data.transcript);
                // Trigger auto archiving after successful transcription
                await handleAutoArchive(data.transcript);
              } else {
                setTranscript("Transcription complete. Ensure Gemini API Key is configured.");
              }
            } catch (err: any) {
              console.error("Transcription error:", err);
            }
          }
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
      } catch (err) {
        console.error("MediaRecorder start failed:", err);
      }
    }
  };

  // Handle auto-archiving on stop recording
  const handleAutoArchive = async (textToArchive: string) => {
    if (!googleToken || !textToArchive.trim() || textToArchive.startsWith("Recording started...") || textToArchive.startsWith("Processing high-quality")) return;
    
    // 1. Auto generate title first
    let generatedTitle = sessionName;
    if (!generatedTitle || generatedTitle === 'Untitled Memory' || generatedTitle === 'Generating Title...') {
      try {
        const res = await fetch('/api/journal/autotitle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: textToArchive })
        });
        const data = await res.json();
        generatedTitle = data.title || "Auto Saved Entry";
        setSessionName(generatedTitle);
      } catch (e) {
        generatedTitle = "Auto Saved Entry";
      }
    }

    // 2. Archive to Google Doc automatically
    setIsArchiving(true);
    setArchiveLink(null);
    setArchiveError(null);

    const title = generatedTitle.trim();
    const tagsInfo = detectedTags.length > 0 ? `\n\n[Live Indicators Detected: ${detectedTags.join(', ')}]` : '';
    const formattedContent = `${title}\nCreated: ${new Date().toLocaleString()}${tagsInfo}\n\n${textToArchive}`;

    try {
      const res = await fetch('/api/drive/create-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleToken,
          title,
          content: formattedContent
        })
      });
      const data = await res.json();
      if (data.success && data.viewUrl) {
        setArchiveLink(data.viewUrl);
      }
    } catch (err) {
      console.error("Auto archive failed:", err);
    } finally {
      setIsArchiving(false);
    }
  };

  const triggerOpinion = () => {
    if (!transcript.trim()) {
      setAiResponse("Please write or speak some thoughts first before requesting an opinion.");
      return;
    }
    setAiResponse('Thinking...');
    wsRef.current?.send(JSON.stringify({ type: 'speak_trigger_opinion', transcript }));
  };

  const triggerMore = () => {
    if (!transcript.trim()) {
      setAiResponse("Please write or speak some thoughts first before prompting for more.");
      return;
    }
    setAiResponse('Thinking...');
    wsRef.current?.send(JSON.stringify({ type: 'speak_trigger_more', transcript }));
  };

  const autoTitle = async () => {
    if (!transcript.trim()) return;
    setSessionName("Generating Title...");
    try {
      const res = await fetch('/api/journal/autotitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });
      const data = await res.json();
      if (data.title) {
        setSessionName(data.title);
      }
    } catch (e) {
      setSessionName("My Story Entry");
    }
  };

  // Real upload to Google Docs
  const saveToGoogleDocs = async () => {
    if (!googleToken) {
      triggerAlert("Please connect your Google Account first.", "info");
      return;
    }
    if (!transcript.trim()) {
      triggerAlert("Your vault memory is empty. Write or speak something first.", "info");
      return;
    }

    setIsArchiving(true);
    setArchiveLink(null);
    setArchiveError(null);

    const title = sessionName.trim() || `My Story Reflections - ${new Date().toLocaleDateString()}`;
    const tagsInfo = detectedTags.length > 0 ? `\n\n[Live Indicators Detected: ${detectedTags.join(', ')}]` : '';
    const formattedContent = `${title}\nCreated: ${new Date().toLocaleString()}${tagsInfo}\n\n${transcript}`;

    try {
      const res = await fetch('/api/drive/create-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleToken,
          title,
          content: formattedContent
        })
      });

      const data = await res.json();
      if (data.success && data.viewUrl) {
        setArchiveLink(data.viewUrl);
      } else {
        setArchiveError(data.error || "Could not save to Google Docs.");
      }
    } catch (e: any) {
      setArchiveError(e.message || "Failed to contact Drive services.");
    } finally {
      setIsArchiving(false);
    }
  };

  // Real upload as .md to Drive
  const saveToDriveMarkdown = async () => {
    if (!googleToken) {
      triggerAlert("Please connect your Google Account first.", "info");
      return;
    }
    if (!transcript.trim()) {
      triggerAlert("Your vault memory is empty. Write or speak something first.", "info");
      return;
    }

    setIsArchiving(true);
    setArchiveLink(null);
    setArchiveError(null);

    const title = sessionName.trim() || `My_Story_${Date.now()}`;
    const filename = `${title.replace(/\s+/g, '_')}.md`;
    const tagsInfo = detectedTags.length > 0 ? `\n\n[Live Indicators: ${detectedTags.join(', ')}]` : '';
    const markdownBody = `# ${title}\n*Created: ${new Date().toLocaleString()}* ${tagsInfo}\n\n${transcript}`;

    try {
      const res = await fetch('/api/drive/upload-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleToken,
          filename,
          content: markdownBody,
          mimeType: 'text/markdown'
        })
      });

      const data = await res.json();
      if (data.success && data.viewUrl) {
        setArchiveLink(data.viewUrl);
      } else {
        setArchiveError(data.error || "Could not write markdown file.");
      }
    } catch (e: any) {
      setArchiveError(e.message || "Failed to contact Google Drive.");
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
      {/* Upper Vault Info Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2D2D2A]/60 pb-6">
        <div>
          <div className="inline-block px-3 py-1 border border-[#802829]/30 bg-[#211414] rounded text-[10px] font-sans uppercase tracking-widest text-[#802829] mb-3">
            🔒 Vault Protected
          </div>
          <h2 className="text-3xl italic text-[#C5BDB0]">Silent Vault</h2>
          <p className="text-[#8B8B7A] mt-1 font-sans text-xs tracking-wider uppercase">Your memory is secure. Speak freely or write below.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={triggerOpinion} 
            className="flex items-center gap-2 px-5 py-3 border border-[#802829]/40 bg-transparent rounded text-[#802829] hover:bg-[#802829] hover:text-[#141412] font-sans text-[11px] uppercase tracking-widest transition-all duration-300"
          >
            Give me your opinion
          </button>
          <button 
            onClick={triggerMore} 
            className="flex items-center gap-2 px-5 py-3 border border-[#802829]/40 bg-transparent rounded text-[#802829] hover:bg-[#802829] hover:text-[#141412] font-sans text-[11px] uppercase tracking-widest transition-all duration-300"
          >
            Prompt me for more
          </button>
        </div>
      </div>

      {/* Main Journal Editor Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Note on Microphones inside an Iframe */}
          <div className="bg-[#1C1C1A] border border-[#2D2D2A]/80 rounded p-4 text-xs font-sans text-[#8B8B7A] flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#802829] shrink-0" />
            <div>
              <span className="text-[#802829] font-bold">Mic Connection Note:</span> Browser security restricts microphones within embedded preview screens. If the start recording button does not capture voice, simply click <span className="text-[#802829] font-bold">"Open in new tab"</span> at the top right of your preview frame to allow microphone permission.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 p-4 border border-[#2D2D2A] bg-[#1A1A17] rounded">
            <div className="flex-1">
              <label className="block text-[10px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-2">Vault Engine</label>
              <select 
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-[#121210] border border-[#2D2D2A] rounded px-3 py-2 text-sm text-[#C5BDB0] font-sans focus:outline-none focus:border-[#802829]/60"
              >
                <option value="gemini-2.5-flash-audio">Gemini 2.5 Flash Native Audio Dialog</option>
                <option value="gemini-3.5-live-translate">Gemini 3.5 Live Translate</option>
              </select>
            </div>
            <div className="w-full sm:w-48">
              <label className="block text-[10px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-2">Input Language</label>
              <select 
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full bg-[#121210] border border-[#2D2D2A] rounded px-3 py-2 text-sm text-[#C5BDB0] font-sans focus:outline-none focus:border-[#802829]/60"
              >
                <option value="auto">Auto (Detect)</option>
                <option value="el">Greek</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Interactive Text Entry Container */}
          <div className="bg-[#181815] border border-[#2D2D2A] rounded p-6 min-h-[380px] flex flex-col relative">
            <div className="flex-1 flex flex-col">
              <textarea 
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="Click 'Start Recording' to transcribe your voice, or type/edit your thoughts here directly..."
                className="w-full flex-1 bg-transparent resize-none text-[#C5BDB0] font-serif leading-relaxed text-lg focus:outline-none placeholder:text-[#5C5C54]"
              />
              
              <AnimatePresence>
                {aiResponse && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-6 pt-4 border-t border-[#2D2D2A] border-dashed"
                  >
                    <p className="text-[10px] font-sans uppercase tracking-widest text-[#802829] mb-2">Empathy companion response</p>
                    <p className="text-[#EAE5DB] font-serif italic text-base leading-relaxed bg-[#1F1414] p-4 rounded border border-[#802829]/20">{aiResponse}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Core Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={toggleRecording}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-sans text-[11px] uppercase tracking-widest transition-all duration-300 ${
                isRecording 
                  ? 'bg-[#802829]/10 text-[#802829] border border-[#802829] hover:bg-[#802829] hover:text-[#EAE5DB] animate-pulse' 
                  : 'bg-[#802829] text-[#141412] font-bold hover:bg-[#943132] transition-all'
              }`}
            >
              {isRecording ? <StopCircle className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
              <span>{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
            </button>

            {/* Compact Manual Session & Archive Controls */}
            <div className="flex flex-col gap-2 p-3 border border-[#2D2D2A]/60 bg-[#121210]/60 rounded-lg max-w-md ml-auto">
              <span className="text-[9px] font-sans uppercase tracking-widest text-[#8B8B7A]">Manual Session Controls</span>
              
              <div className="flex items-center gap-3">
                {/* Manual Session Name Input */}
                <div className="flex bg-[#121210] border border-[#2D2D2A] rounded overflow-hidden">
                  <input 
                    type="text" 
                    placeholder="Manual Session Name" 
                    value={sessionName}
                    onChange={e => setSessionName(e.target.value)}
                    className="bg-transparent px-2 py-1 text-[10px] focus:outline-none text-[#C5BDB0] font-sans w-36"
                  />
                  <button 
                    onClick={autoTitle}
                    disabled={!transcript.trim()}
                    className="px-2 border-l border-[#2D2D2A] text-[#8B8B7A] hover:text-[#C5BDB0] text-[8px] font-sans uppercase tracking-widest transition-colors flex items-center gap-1 disabled:opacity-40"
                    title="Generate Title with Gemini"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Auto
                  </button>
                </div>

                {/* Manual Archive Actions */}
                {googleToken ? (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={saveToGoogleDocs}
                      disabled={isArchiving || !transcript.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#211414] border border-[#802829]/30 hover:bg-[#802829] hover:text-[#141412] text-[#802829] rounded text-[9px] font-sans uppercase tracking-widest transition-colors disabled:opacity-40"
                      title="Manually archive as a Google Doc"
                    >
                      <FileText className="w-2.5 h-2.5" />
                      Manual Doc
                    </button>
                    <button 
                      onClick={saveToDriveMarkdown}
                      disabled={isArchiving || !transcript.trim()}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1C1C1A] border border-[#2D2D2A] hover:bg-[#2D2D2A] text-[#C5BDB0] rounded text-[9px] font-sans uppercase tracking-widest transition-colors disabled:opacity-40"
                      title="Manually upload as a Markdown file"
                    >
                      <UploadCloud className="w-2.5 h-2.5" />
                      Manual MD
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={onLinkGoogle}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1C1C1A] border border-[#802829]/40 hover:bg-[#802829]/10 text-[#802829] rounded text-[9px] font-sans uppercase tracking-widest transition-colors"
                  >
                    <UploadCloud className="w-2.5 h-2.5" />
                    Link Google Drive
                  </button>
                )}
              </div>
              <p className="text-[8px] text-[#8B8B7A]/80 font-sans tracking-wide italic mt-0.5">
                * This session will be titled and archived automatically if not done manually.
              </p>
            </div>
          </div>

          {/* Link Results */}
          <AnimatePresence>
            {isArchiving && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-sans text-[#8B8B7A] flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#802829]" /> Saving real file to your Google account...
              </motion.div>
            )}
            {archiveLink && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-[#141C16] border border-[#27532B] rounded flex flex-col md:flex-row md:items-center justify-between gap-3 font-sans"
              >
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#41A85C]">✓ Memory Saved Successfully!</h4>
                  <p className="text-xs text-[#8B8B7A] mt-1">This entry has been written to your personal Google space.</p>
                </div>
                <a 
                  href={archiveLink} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="px-4 py-2 bg-[#1C4124] text-[#EAE5DB] hover:bg-[#27532B] rounded text-xs uppercase tracking-widest transition-all flex items-center gap-1"
                >
                  View on Google <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </motion.div>
            )}
            {archiveError && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-[#1E1111] border border-[#532727] rounded text-xs font-sans text-[#C5BDB0]"
              >
                <span className="text-[#802829] font-bold">Drive Error:</span> {archiveError}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Real-time indicator sidebar */}
        <div className="col-span-1 bg-[#1A1A17] border border-[#2D2D2A] rounded p-6 flex flex-col">
          <h3 className="text-[10px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-4 flex items-center justify-between">
            Live Indicators
            <span className="text-[8px] px-2 py-0.5 bg-[#211414] text-[#802829] border border-[#802829]/20 rounded">Real-time Parsing</span>
          </h3>
          <p className="text-xs text-[#8B8B7A] font-sans leading-relaxed mb-6">Analyzes traumatic narrative markers as they form. These indicators are preserved within the archive metadata.</p>
          
          <div className="flex-1 flex flex-col gap-3">
            {detectedTags.map(tag => (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                key={tag}
                className="px-3 py-2.5 border border-[#802829]/20 rounded text-sm text-[#C5BDB0] bg-[#121210] flex justify-between items-center"
              >
                <span className="font-sans text-xs tracking-wider">{tag}</span>
                <span className="w-2 h-2 rounded-full bg-[#802829] animate-pulse"></span>
              </motion.div>
            ))}
            {detectedTags.length === 0 && (
              <div className="text-center text-[#8B8B7A]/40 text-xs py-10 font-sans italic">
                No active indicators...
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface SynthesisStudioProps {
  googleToken: string | null;
  key?: string;
}

function SynthesisStudio({ googleToken }: SynthesisStudioProps) {
  const [model, setModel] = useState('gemma-4-31b');
  const [prompt, setPrompt] = useState('Synthesize these journal entries into a cohesive chapter outline, focusing on identifying patterns of emotional invalidation and resilience.');
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState('');
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Load real user files if Google is connected
  useEffect(() => {
    if (googleToken) {
      setIsLoadingFiles(true);
      fetch('/api/drive/list-files', {
        headers: { 'Authorization': `Bearer ${googleToken}` }
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setDriveFiles(data.files || []);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoadingFiles(false));
    }
  }, [googleToken]);

  const handleSynthesize = async () => {
    setIsGenerating(true);
    setDraft('');
    
    // Package selected files metadata to send
    const selectedFiles = driveFiles.filter(f => selectedFileIds.includes(f.id));

    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          files: selectedFiles, 
          model, 
          prompt,
          accessToken: googleToken
        })
      });
      const data = await res.json();
      if (data.success) {
        setDraft(data.draft);
      } else {
        setDraft(`Error: ${data.error}\n\nPlease verify your API keys are configured correctly in the Settings Center.`);
      }
    } catch (e: any) {
      setDraft(`Error: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setSelectedFileIds(prev => 
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
      <div className="mb-8 border-b border-[#2D2D2A]/60 pb-6">
        <h2 className="text-3xl italic text-[#C5BDB0]">Synthesis Studio</h2>
        <p className="text-[#8B8B7A] mt-1 font-sans text-xs tracking-wider uppercase">Compile your real archived entries directly into book chapters.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-[#1A1A17] border border-[#2D2D2A] rounded p-6">
            <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#802829]" />
              <span>Drive Source Materials</span>
            </h3>
            
            {googleToken ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {isLoadingFiles ? (
                  <p className="text-xs font-sans text-[#8B8B7A] animate-pulse">Loading documents from Google Drive...</p>
                ) : driveFiles.length > 0 ? (
                  driveFiles.map(file => (
                    <label key={file.id} className="flex items-start gap-3 p-3 hover:bg-[#2D2D2A]/50 rounded cursor-pointer transition-colors border border-transparent hover:border-[#2D2D2A]">
                      <input 
                        type="checkbox" 
                        checked={selectedFileIds.includes(file.id)}
                        onChange={() => toggleSelectFile(file.id)}
                        className="mt-0.5 rounded border-[#2D2D2A] bg-[#121210] text-[#802829] focus:ring-[#802829]" 
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-sans text-[#EAE5DB] line-clamp-1">{file.name}</span>
                        <span className="text-[9px] text-[#8B8B7A] font-sans mt-0.5">Type: {file.mimeType.split('.').pop()}</span>
                      </div>
                    </label>
                  ))
                ) : (
                  <p className="text-xs font-sans text-[#8B8B7A] italic py-4">No compatible files found in Drive. Write and save some memories in the Vault tab first!</p>
                )}
              </div>
            ) : (
              <div className="py-6 text-center border border-dashed border-[#2D2D2A] rounded p-4">
                <p className="text-xs font-sans text-[#8B8B7A] mb-4">Please connect your Google Account to dynamically read files from your Google Drive.</p>
                <p className="text-[10px] text-[#802829] uppercase tracking-widest font-sans font-bold">Awaiting Auth Link...</p>
              </div>
            )}
          </div>

          <div className="bg-[#1A1A17] border border-[#2D2D2A] rounded p-6 flex flex-col gap-5">
            <div>
              <label className="block text-[10px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-2">Synthesis Model</label>
              <select 
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-[#121210] border border-[#2D2D2A] rounded px-3 py-2 text-sm text-[#C5BDB0] font-sans focus:outline-none focus:border-[#802829]/60"
              >
                <optgroup label="Gemini (Recommended)">
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemma-4-31b">Gemma 4 31B</option>
                </optgroup>
                <optgroup label="Groq SOTA Models">
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Groq)</option>
                  <option value="meta-llama/llama-4-scout-17b-16e-instruct">meta-llama/llama-4-scout-17b-16e-instruct (Groq)</option>
                  <option value="openai/gpt-oss-20b">openai/gpt-oss-20b (Groq)</option>
                  <option value="qwen/qwen3-32b">qwen/qwen3-32b (Groq)</option>
                </optgroup>
                <optgroup label="Cerebras SOTA Models">
                  <option value="cerebras/gemma-4-31b">gemma-4-31b (Cerebras)</option>
                </optgroup>
                <optgroup label="NVIDIA">
                  <option value="nvidia/nemotron-3-ultra-550b-a55b">nvidia/nemotron-3-ultra-550b-a55b</option>
                  <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
                  <option value="qwen/qwen3.5-397b-a17b">qwen/qwen3.5-397b-a17b</option>
                </optgroup>
                <optgroup label="Mistral">
                  <option value="magistral-medium-2509">magistral-medium-2509</option>
                  <option value="mistral-large-2512">mistral-large-2512</option>
                </optgroup>
              </select>
            </div>
            
            <div>
              <label className="block text-[10px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-2">Synthesis Directives</label>
              <textarea 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="w-full bg-[#121210] border border-[#2D2D2A] rounded px-3 py-2 text-xs text-[#C5BDB0] font-sans focus:outline-none focus:border-[#802829]/60 h-28 resize-none"
              />
            </div>

            <button 
              onClick={handleSynthesize}
              disabled={isGenerating || (googleToken && selectedFileIds.length === 0)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#802829] text-[#141412] hover:bg-[#943132] rounded text-[11px] font-bold font-sans uppercase tracking-widest transition-all disabled:opacity-40"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isGenerating ? 'Synthesizing...' : 'Synthesize Draft'}</span>
            </button>
            {googleToken && selectedFileIds.length === 0 && (
              <p className="text-[9px] text-[#8B8B7A] text-center font-sans">Please select at least one file from your Google Drive list to synthesize.</p>
            )}
          </div>
        </div>

        {/* Chapters view container */}
        <div className="lg:col-span-2">
          <div className="bg-[#1A1A17] border border-[#2D2D2A] rounded p-8 min-h-[500px]">
            {draft ? (
              <div className="prose prose-invert prose-neutral max-w-none">
                <pre className="text-[#C5BDB0] font-serif whitespace-pre-wrap leading-relaxed text-base">{draft}</pre>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[#8B8B7A] py-32 font-sans text-sm gap-4">
                <FileText className="w-10 h-10 opacity-40 text-[#802829]" />
                <p className="text-center text-xs tracking-wider max-w-md">Select source documents, configure your parameters, and execute synthesis to compile your draft chapter.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface SettingsCenterProps {
  googleToken: string | null;
  userEmail: string | null;
  onLinkGoogle: () => any;
  onDisconnect: () => any;
  triggerAlert?: (msg: string, type?: 'info' | 'error' | 'success') => void;
  key?: string;
}

function SettingsCenter({ googleToken, userEmail, onLinkGoogle, onDisconnect, triggerAlert }: SettingsCenterProps) {
  const [config, setConfig] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig);
  }, []);

  const handleChange = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    setIsSaving(false);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2D2D2A]/60 pb-6">
        <div>
          <h2 className="text-3xl italic text-[#C5BDB0]">Settings Center</h2>
          <p className="text-[#8B8B7A] mt-1 font-sans text-xs tracking-wider uppercase">Configure secure local vault parameters and system integration API keys.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-[#802829] hover:bg-[#943132] text-[#141412] font-bold rounded text-[11px] font-sans uppercase tracking-widest transition-all"
        >
          {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
        </button>
      </div>

      {showNotification && (
        <div className="p-4 bg-[#141C16] border border-[#27532B] rounded text-xs font-sans text-[#41A85C] flex items-center gap-2">
          <Check className="w-4 h-4" /> Config file saved successfully to environment workspace variables!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-[#1A1A17] border border-[#2D2D2A] rounded p-6">
            <h3 className="text-xs font-sans uppercase tracking-widest text-[#EAE5DB] border-b border-[#2D2D2A] pb-3 mb-5">Model Keys</h3>
            <div className="space-y-5">
              <Input label="Google Gemini API Key" value={config.GEMINI_API_KEY || ''} onChange={v => handleChange('GEMINI_API_KEY', v)} />
              <Input label="NVIDIA NIM API Key" value={config.NVIDIA_API_KEY || ''} onChange={v => handleChange('NVIDIA_API_KEY', v)} />
              <Input label="Mistral API Key" value={config.MISTRAL_API_KEY || ''} onChange={v => handleChange('MISTRAL_API_KEY', v)} />
              <Input label="Groq API Key" value={config.GROQ_API_KEY || ''} onChange={v => handleChange('GROQ_API_KEY', v)} />
              <Input label="Cerebras API Key" value={config.CEREBRAS_API_KEY || ''} onChange={v => handleChange('CEREBRAS_API_KEY', v)} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#1A1A17] border border-[#2D2D2A] rounded p-6">
            <h3 className="text-xs font-sans uppercase tracking-widest text-[#EAE5DB] border-b border-[#2D2D2A] pb-3 mb-5">Google Drive & Docs</h3>
            <div className="space-y-5">
              <Input label="OAuth Client ID" value={config.GOOGLE_CLIENT_ID || ''} onChange={v => handleChange('GOOGLE_CLIENT_ID', v)} />
              <Input label="OAuth Client Secret" value={config.GOOGLE_CLIENT_SECRET || ''} onChange={v => handleChange('GOOGLE_CLIENT_SECRET', v)} />
            </div>
            
            <div className="mt-8 pt-6 border-t border-[#2D2D2A]">
              <p className="text-xs font-sans text-[#8B8B7A] mb-4">Connect My Story to write and edit directly inside your personal Google Drive and Google Docs space.</p>
              
              <div className="flex flex-col gap-3">
                {googleToken ? (
                  <div className="p-3 bg-[#1E1111] border border-[#532727] rounded text-xs font-sans flex flex-col gap-2">
                    <p className="text-[#8B8B7A]">Linked as: <span className="text-[#802829] font-bold">{userEmail}</span></p>
                    <button 
                      onClick={onDisconnect}
                      className="w-full py-2 border border-[#802829]/40 text-[#802829] hover:bg-[#802829] hover:text-[#141412] rounded text-[10px] font-bold uppercase tracking-widest font-sans transition-colors"
                    >
                      Disconnect Account
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={onLinkGoogle}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#802829] text-[#141412] hover:bg-[#943132] rounded text-[11px] font-bold font-sans uppercase tracking-widest transition-colors"
                  >
                    Link Google Account
                  </button>
                )}
                
                <a 
                  href="https://drive.google.com/drive/my-drive" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#211414] border border-[#802829]/30 text-[#802829] hover:bg-[#802829] hover:text-[#141412] rounded text-[11px] font-sans uppercase tracking-widest transition-all"
                >
                  Go to Saved Memories Folder in Drive ↗
                </a>

                <a 
                  href="https://drive.google.com/" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-[#2D2D2A] text-[#C5BDB0] hover:bg-[#1E1E1C] rounded text-[11px] font-sans uppercase tracking-widest transition-all"
                >
                  Open Drive Homepage ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Input({ label, value, onChange }: any) {
  return (
    <div>
      <label className="block text-[10px] font-sans uppercase tracking-widest text-[#8B8B7A] mb-2">{label}</label>
      <input 
        type={value.includes('***') ? "password" : "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[#121210] border border-[#2D2D2A] rounded px-3 py-2 text-sm text-[#C5BDB0] font-sans focus:outline-none focus:border-[#802829]/60"
      />
    </div>
  );
}
