import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, ArrowRight, Check, CheckCheck, Paperclip, Image as ImageIcon, Video, Play } from "lucide-react";
import { isInternalChatOnly } from "../data/staffAuth";

// ─── Types ─────────────────────────────────────────────────────────────
interface Attachment { type: "image" | "video"; url: string; name: string; }
interface Message { id: number; text: string; sender: "me" | "other"; time: string; read: boolean; attachment?: Attachment; }
interface Conversation { id: number; name: string; role: string; avatar: string; online: boolean; unread: number; lastMessage: string; lastTime: string; messages: Message[]; }

// ─── Compact Mock Data ─────────────────────────────────────────────────
const ownerConversations: Conversation[] = [
  { id: 1, name: 'ד"ר יוסי כהן', role: "וטרינר ראשי", avatar: "YK", online: true, unread: 1, lastMessage: "אני ממליץ לבוא ל-09:00", lastTime: "10:32", messages: [
    { id: 1, text: "שלום דוקטור, רקס לא אוכל יומיים", sender: "me", time: "10:15", read: true },
    { id: 2, text: "אני ממליץ לבוא ל-09:00, נעשה בדיקת דם", sender: "other", time: "10:32", read: false },
  ]},
  { id: 2, name: 'ד"ר שרה לוי', role: "וטרינרית", avatar: "SL", online: false, unread: 0, lastMessage: "התוצאות תקינות", lastTime: "אתמול", messages: [
    { id: 1, text: "התוצאות תקינות", sender: "other", time: "16:30", read: true },
  ]},
];

const internalStaffConversations: Conversation[] = [
  { id: 1, name: 'ד"ר יוסי כהן', role: "וטרינר ראשי", avatar: "YK", online: true, unread: 1, lastMessage: "אפשר להכין את חדר 2?", lastTime: "12:05", messages: [
    { id: 1, text: "אפשר להכין את חדר 2 לניתוח ב-14:00?", sender: "other", time: "12:05", read: false },
  ]},
  { id: 2, name: "רותי (מזכירה)", role: "קבלה", avatar: "RK", online: true, unread: 2, lastMessage: "יש 3 תורים שמחכים", lastTime: "12:15", messages: [
    { id: 1, text: "יש 3 תורים שמחכים לאישור למחר", sender: "other", time: "12:15", read: false },
  ]},
];

const staffConversations: Conversation[] = [
  { id: 1, name: "משפחת ישראלי", role: "בעלים — רקס", avatar: "YI", online: true, unread: 1, lastMessage: "לא, רק חוסר תיאבון", lastTime: "10:28", messages: [
    { id: 1, text: "לא, רק חוסר תיאבון וישן הרבה", sender: "other", time: "10:28", read: false },
  ]},
];

// ─── Sub-Components ────────────────────────────────────────────────────
const ConversationItem = ({ conv, onClick }: { conv: Conversation; onClick: () => void }) => (
  <button onClick={onClick} className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-blue-50/50 transition-colors border-b border-gray-50 text-right cursor-pointer">
    <div className="relative shrink-0">
      <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-[#1e40af] font-bold text-[13px]">{conv.avatar}</div>
      {conv.online && <div className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex justify-between mb-0.5">
        <span className="text-gray-900 text-[14px] font-semibold truncate">{conv.name}</span>
        <span className="text-gray-400 text-[11px]">{conv.lastTime}</span>
      </div>
      <div className="flex justify-between">
        <p className="text-gray-500 text-[12px] truncate max-w-[200px]">{conv.lastMessage}</p>
        {conv.unread > 0 && <span className="bg-[#1e40af] text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold">{conv.unread}</span>}
      </div>
    </div>
  </button>
);

const MessageBubble = ({ msg, onImageClick }: { msg: Message; onImageClick: (url: string) => void }) => (
  <div className={`flex ${msg.sender === "me" ? "justify-start" : "justify-end"}`}>
    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.sender === "me" ? "bg-[#1e40af] text-white rounded-br-md" : "bg-white border border-gray-100 shadow-sm rounded-bl-md"}`}>
      {msg.attachment && (
        <div className="mb-2">
          {msg.attachment.type === "image" ? (
            <img src={msg.attachment.url} alt="attachment" onClick={() => onImageClick(msg.attachment!.url)} className="max-w-full max-h-[140px] rounded-lg object-cover cursor-pointer" />
          ) : (
            <video src={msg.attachment.url} controls className="max-w-full max-h-[140px] rounded-lg bg-black/10" />
          )}
        </div>
      )}
      {msg.text && <p className="text-[13px] leading-relaxed">{msg.text}</p>}
      <div className={`flex items-center gap-1 mt-1 ${msg.sender === "me" ? "text-white/50" : "text-gray-400"} text-[10px]`}>
        <span>{msg.time}</span>
        {msg.sender === "me" && (msg.read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
      </div>
    </div>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────
export function ChatWidget({ mode }: { mode: "owner" | "staff" }) {
  const internalOnly = mode === "staff" && isInternalChatOnly();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(mode === "owner" ? ownerConversations : internalOnly ? internalStaffConversations : staffConversations);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTypeRef = useRef<"image" | "video">("image");

  const activeConv = conversations.find((c) => c.id === activeConvId) || null;
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [activeConv?.messages.length]);

  const handleSend = () => {
    if ((!newMessage.trim() && !pendingAttachment) || !activeConvId) return;
    const timeStr = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
    const msgText = newMessage.trim();
    
    setConversations((prev) => prev.map((c) => c.id === activeConvId ? {
      ...c, lastMessage: msgText || "קובץ מצורף", lastTime: timeStr,
      messages: [...c.messages, { id: Date.now(), text: msgText, sender: "me", time: timeStr, read: false, attachment: pendingAttachment || undefined }]
    } : c));
    setNewMessage(""); setPendingAttachment(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingAttachment({ type: fileTypeRef.current, url: URL.createObjectURL(file), name: file.name });
    setShowAttachMenu(false);
  };

  return (
    <>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 px-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Floating Button - הועלה למעלה והאייקון שונה */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 left-8 z-[999] w-14 h-14 rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white shadow-xl flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!isOpen && totalUnread > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[22px] h-[22px] flex items-center justify-center border-2 border-white">{totalUnread}</span>}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div dir="rtl" className="fixed bottom-[110px] left-8 z-[998] w-[360px] h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden font-sans">
          
          {/* Header */}
          <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-5 py-4 flex items-center gap-3 text-white">
            {activeConv && <button onClick={() => setActiveConvId(null)} className="cursor-pointer"><ArrowRight className="w-5 h-5 rotate-180" /></button>}
            <MessageCircle className="w-5 h-5 opacity-80" />
            <div>
              <h3 className="text-[15px] font-semibold">{activeConv ? activeConv.name : "הודעות"}</h3>
              <p className="text-[11px] opacity-75">{activeConv ? (activeConv.online ? "מחובר/ת" : "לא מחובר/ת") : "שוחח/י עם צוות המרפאה"}</p>
            </div>
          </div>

          {/* Content */}
          {!activeConv ? (
            <div className="flex-1 overflow-y-auto">
              {conversations.map((conv) => <ConversationItem key={conv.id} conv={conv} onClick={() => setActiveConvId(conv.id)} />)}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50">
                {activeConv.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} onImageClick={setLightboxUrl} />)}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="px-4 py-3 border-t border-gray-100 bg-white relative">
                {showAttachMenu && (
                  <div className="absolute bottom-16 right-4 bg-white border border-gray-200 shadow-lg rounded-xl py-2 w-32 z-10">
                    <button onClick={() => { fileTypeRef.current="image"; fileInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 cursor-pointer"><ImageIcon className="w-4 h-4 text-emerald-500" /><span className="text-[13px]">תמונה</span></button>
                    <button onClick={() => { fileTypeRef.current="video"; fileInputRef.current?.click(); setShowAttachMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-50 cursor-pointer"><Video className="w-4 h-4 text-purple-500" /><span className="text-[13px]">סרטון</span></button>
                  </div>
                )}
                
                {pendingAttachment && <div className="mb-2 text-[11px] text-blue-600 bg-blue-50 px-2 py-1 rounded">קובץ מצורף: {pendingAttachment.name}</div>}
                
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-2 text-gray-400 hover:text-blue-600 cursor-pointer rounded-full hover:bg-gray-100"><Paperclip className="w-5 h-5" /></button>
                  <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="כתוב/י הודעה..." className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-[13px] outline-none focus:ring-1 focus:ring-blue-400" />
                  <button onClick={handleSend} disabled={!newMessage && !pendingAttachment} className="w-9 h-9 bg-[#1e40af] text-white rounded-full flex items-center justify-center cursor-pointer disabled:opacity-50"><Send className="w-4 h-4 rotate-180 -ml-1" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}