import { useState, useRef, useEffect } from "react";
import {
  MessageCircle,
  X,
  Send,
  ArrowRight,
  Check,
  CheckCheck,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Play,
  Download,
  Users,
} from "lucide-react";
import { isInternalChatOnly } from "../data/staffAuth";

interface Attachment {
  type: "image" | "video";
  url: string;
  name: string;
}

interface Message {
  id: number;
  text: string;
  sender: "me" | "other";
  time: string;
  read: boolean;
  attachment?: Attachment;
}

interface Conversation {
  id: number;
  name: string;
  role: string;
  avatar: string;
  online: boolean;
  unread: number;
  lastMessage: string;
  lastTime: string;
  messages: Message[];
}

const ownerConversations: Conversation[] = [
  {
    id: 1,
    name: 'ד"ר יוסי כהן',
    role: "וטרינר ראשי",
    avatar: "YK",
    online: true,
    unread: 2,
    lastMessage: "בהחלט, אפשר להגיע מחר בבוקר לבדיקה",
    lastTime: "10:32",
    messages: [
      { id: 1, text: "שלום דוקטור, רציתי לשאול לגבי רקס", sender: "me", time: "10:15", read: true },
      { id: 2, text: "הוא לא אוכל כבר יומיים ונראה עייף", sender: "me", time: "10:16", read: true },
      { id: 3, text: "שלום! כמה זמן בדיוק הוא לא אוכל?", sender: "other", time: "10:20", read: true },
      { id: 4, text: "מאז יום שישי בערב", sender: "me", time: "10:22", read: true },
      { id: 5, text: "האם יש הקאות או שלשול?", sender: "other", time: "10:25", read: true },
      { id: 6, text: "לא, רק חוסר תיאבון וישן הרבה", sender: "me", time: "10:28", read: true },
      { id: 7, text: "בהחלט, אפשר להגיע מחר בבוקר לבדיקה", sender: "other", time: "10:30", read: true },
      { id: 8, text: "אני ממליץ לבוא ל-09:00, נעשה בדיקת דם מקיפה", sender: "other", time: "10:32", read: false },
    ],
  },
  {
    id: 2,
    name: 'ד"ר שרה לוי',
    role: "וטרינרית",
    avatar: "SL",
    online: false,
    unread: 0,
    lastMessage: "תוצאות בדיקת הדם של ניקו תקינות تماما",
    lastTime: "אתמול",
    messages: [
      { id: 1, text: 'שלום ד"ר לוי, האם יש תוצאות של הבדיקה?', sender: "me", time: "14:00", read: true },
      { id: 2, text: "תוצאות בדיקת הדם של ניקו תקינות تماما", sender: "other", time: "16:30", read: true },
      { id: 3, text: "מעולה, תודה רבה!", sender: "me", time: "16:45", read: true },
    ],
  },
  {
    id: 3,
    name: "קבלה - מרפאת MyVet",
    role: "מזכירה",
    avatar: "MV",
    online: true,
    unread: 1,
    lastMessage: "התור שלכם אושר ליום רביעי בשעה 10:00",
    lastTime: "09:15",
    messages: [
      { id: 1, text: "שלום, רציתי לקבוע תור לניקו", sender: "me", time: "09:00", read: true },
      { id: 2, text: "בוקר טוב! בוודאי, לאיזה שירות?", sender: "other", time: "09:05", read: true },
      { id: 3, text: "חיסון שנתי", sender: "me", time: "09:08", read: true },
      { id: 4, text: "התור שלכם אושר ליום רביעי בשעה 10:00", sender: "other", time: "09:15", read: false },
    ],
  },
];

const internalStaffConversations: Conversation[] = [
  {
    id: 1,
    name: 'ד"ר יוסי כהן',
    role: "וטרינר ראשי",
    avatar: "YK",
    online: true,
    unread: 1,
    lastMessage: "אפשר להכין את חדר 2 לניתוח ב-14:00?",
    lastTime: "12:05",
    messages: [
      { id: 1, text: "שלום, יש לנו ניתוח סירוס ב-14:00", sender: "other", time: "11:50", read: true },
      { id: 2, text: "אפשר להכין את חדר 2 לניתוח ב-14:00?", sender: "other", time: "12:05", read: false },
    ],
  },
  {
    id: 2,
    name: 'ד"ר שרה לוי',
    role: "וטרינרית",
    avatar: "SL",
    online: true,
    unread: 0,
    lastMessage: "תוצאות המעבדה של לונה חזרו, הכל תקין",
    lastTime: "11:20",
    messages: [
      { id: 1, text: "בדקתי את לונה הבוקר, שלחתי דם למעבדה", sender: "other", time: "09:30", read: true },
      { id: 2, text: "תעדכני כשיחזרו תוצאות בבקשה", sender: "me", time: "09:35", read: true },
      { id: 3, text: "תוצאות המעבדה של לונה חזרו, הכל תקין", sender: "other", time: "11:20", read: true },
    ],
  },
  {
    id: 3,
    name: "רותי (מזכירה)",
    role: "קבלה",
    avatar: "RK",
    online: true,
    unread: 2,
    lastMessage: "יש 3 תורים שמחכים לאישור למחר",
    lastTime: "12:15",
    messages: [
      { id: 1, text: "בוקר טוב! עדכון יומי: 8 תורים היום", sender: "other", time: "08:00", read: true },
      { id: 2, text: "תודה, ראיתי ביומן", sender: "me", time: "08:15", read: true },
      { id: 3, text: "הגיעה הזמנת מלאי חדשה מהספק", sender: "other", time: "11:00", read: true },
      { id: 4, text: "יש 3 תורים שמחכים לאישור למחר", sender: "other", time: "12:15", read: false },
    ],
  },
  {
    id: 4,
    name: "נועה (אחות)",
    role: "אחות בכירה",
    avatar: "NA",
    online: false,
    unread: 0,
    lastMessage: "סיימתי למלא את המלאי בחדר טיפולים",
    lastTime: "אתמול",
    messages: [
      { id: 1, text: "חסר לנו מזרקים 5ml בחדר 1", sender: "me", time: "14:00", read: true },
      { id: 2, text: "סיימתי למלא את המלאי בחדר טיפולים", sender: "other", time: "14:30", read: true },
    ],
  },
];

const staffConversations: Conversation[] = [
  {
    id: 1,
    name: "משפחת ישראלי",
    role: "בעלים — רקס, ניקו",
    avatar: "YI",
    online: true,
    unread: 2,
    lastMessage: "לא, רק חוסר תיאבון וישן הרבה",
    lastTime: "10:28",
    messages: [
      { id: 1, text: "שלום דוקטור, רציתי לשאול לגבי רקס", sender: "other", time: "10:15", read: true },
      { id: 2, text: "הוא לא אוכל כבר יומיים ונראה עייף", sender: "other", time: "10:16", read: true },
      { id: 3, text: "שלום! כמה זמן בדיוק הוא לא אוכל?", sender: "me", time: "10:20", read: true },
      { id: 4, text: "מאז יום שישי בערב", sender: "other", time: "10:22", read: true },
      { id: 5, text: "האם יש הקאות או שלשול?", sender: "me", time: "10:25", read: true },
      { id: 6, text: "לא, רק חוסר תיאבון וישן הרבה", sender: "other", time: "10:28", read: false },
    ],
  },
  {
    id: 2,
    name: "מיכל לוי",
    role: "בעלים — לונה",
    avatar: "ML",
    online: true,
    unread: 1,
    lastMessage: "האם אפשר לשנות את התור ליום חמישי?",
    lastTime: "11:45",
    messages: [
      { id: 1, text: "שלום, רציתי לעדכן לגבי לונה", sender: "other", time: "11:30", read: true },
      { id: 2, text: "היא אוכלת יותר טוב מאז הביקור האחרון", sender: "other", time: "11:31", read: true },
      { id: 3, text: "שמחה לשמוע! נמשיך לעקוב", sender: "me", time: "11:35", read: true },
      { id: 4, text: "האם אפשר לשנות את התור ליום חמישי?", sender: "other", time: "11:45", read: false },
    ],
  },
  {
    id: 3,
    name: "דני אברהם",
    role: "בעלים — מקס",
    avatar: "DA",
    online: false,
    unread: 0,
    lastMessage: "תודה רבה, מקס מרגיש הרבה יותר טוב",
    lastTime: "אתמול",
    messages: [
      { id: 1, text: "שלום, רצינו לעדכן שמקס התאושש מהניתוח", sender: "other", time: "15:00", read: true },
      { id: 2, text: "מעולה! ממשיכים עם התרופות כמו שסיכמנו", sender: "me", time: "15:30", read: true },
      { id: 3, text: "תודה רבה, מקס מרגיש הרבה יותר טוב", sender: "other", time: "15:45", read: true },
    ],
  },
  {
    id: 4,
    name: "שרה גולדברג",
    role: "בעלים — מיאו",
    avatar: "SG",
    online: false,
    unread: 0,
    lastMessage: "האם צריך להגיע לבדיקת מעקב?",
    lastTime: "28/02",
    messages: [
      { id: 1, text: "שלום, סיימנו את טיפול השיניים בהצלחה", sender: "me", time: "14:00", read: true },
      { id: 2, text: "מעולה, תודה!", sender: "other", time: "14:30", read: true },
      { id: 3, text: "האם צריך להגיע לבדיקת מעקב?", sender: "other", time: "14:35", read: true },
      { id: 4, text: "כן, בעוד שבועיים בבקשה", sender: "me", time: "14:40", read: true },
    ],
  },
];

interface ChatWidgetProps {
  mode: "owner" | "staff";
}

export function ChatWidget({ mode }: ChatWidgetProps) {
  const internalOnly = mode === "staff" && isInternalChatOnly();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(
    mode === "owner"
      ? ownerConversations
      : internalOnly
        ? internalStaffConversations
        : staffConversations
  );
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileTypeRef = useRef<"image" | "video">("image");

  const activeConv = conversations.find((c) => c.id === activeConvId) || null;
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages.length]);

  useEffect(() => {
    if (activeConvId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeConvId]);

  // Close attach menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    if (showAttachMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAttachMenu]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const type = fileTypeRef.current;
    setPendingAttachment({ type, url, name: file.name });
    setShowAttachMenu(false);
    // Reset the file input so user can re-select same file
    e.target.value = "";
  };

  const triggerFilePicker = (type: "image" | "video") => {
    fileTypeRef.current = type;
    if (fileInputRef.current) {
      fileInputRef.current.accept = type === "image" ? "image/*" : "video/*";
      fileInputRef.current.click();
    }
    setShowAttachMenu(false);
  };

  const handleSend = () => {
    if (!newMessage.trim() && !pendingAttachment) return;
    if (!activeConvId) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const msgText = newMessage.trim();
    const lastMsgPreview = pendingAttachment
      ? pendingAttachment.type === "image"
        ? msgText || "📷 תמונה"
        : msgText || "🎬 סרטון"
      : msgText;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId
          ? {
              ...c,
              lastMessage: lastMsgPreview,
              lastTime: timeStr,
              messages: [
                ...c.messages,
                {
                  id: c.messages.length + 1,
                  text: msgText,
                  sender: "me",
                  time: timeStr,
                  read: false,
                  ...(pendingAttachment ? { attachment: pendingAttachment } : {}),
                },
              ],
            }
          : c
      )
    );
    setNewMessage("");
    setPendingAttachment(null);
  };

  const openConversation = (id: number) => {
    setActiveConvId(id);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, unread: 0, messages: c.messages.map((m) => ({ ...m, read: true })) }
          : c
      )
    );
  };

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 px-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -left-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center cursor-pointer z-10 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
            {lightboxUrl.startsWith("blob:") ? (
              <img
                src={lightboxUrl}
                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
                alt=""
              />
            ) : (
              <img
                src={lightboxUrl}
                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
                alt=""
              />
            )}
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 left-6 z-[999] w-14 h-14 rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] text-white shadow-xl shadow-blue-500/30 flex items-center justify-center cursor-pointer transition-all hover:scale-105"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
        {!isOpen && totalUnread > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5.5 h-5.5 bg-red-500 text-white text-[11px] rounded-full flex items-center justify-center border-2 border-white min-w-[22px] h-[22px]"
            style={{ fontWeight: 700 }}
          >
            {totalUnread}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className="fixed bottom-24 left-6 z-[998] w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          dir="rtl"
          style={{ fontFamily: "'Heebo', sans-serif" }}
        >
          {/* Header */}
          <div className="bg-gradient-to-l from-[#1e40af] to-[#2563eb] px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              {activeConv && (
                <button
                  onClick={() => {
                    setActiveConvId(null);
                    setPendingAttachment(null);
                    setShowAttachMenu(false);
                  }}
                  className="text-white/70 hover:text-white cursor-pointer transition-colors p-1 -mr-1"
                >
                  <ArrowRight className="w-5 h-5 rotate-180" />
                </button>
              )}
              <MessageCircle className="w-5 h-5 text-white/80" />
              <div>
                <h3 className="text-white text-[15px]" style={{ fontWeight: 600 }}>
                  {activeConv ? activeConv.name : "הודעות"}
                </h3>
                {activeConv ? (
                  <p className="text-white/60 text-[11px]">
                    {activeConv.online ? "מחובר/ת" : "לא מחובר/ת"}
                  </p>
                ) : (
                  <p className="text-white/60 text-[11px]">
                    {mode === "owner"
                      ? "שוחח/י עם צוות המרפאה"
                      : internalOnly
                        ? "צ׳אט פנימי — צוות המרפאה"
                        : "הודעות מבעלי חיות"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          {!activeConv ? (
            /* Conversation List */
            <div className="flex-1 overflow-y-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-blue-50/50 transition-colors cursor-pointer border-b border-gray-50 text-right"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center">
                      <span
                        className="text-[#1e40af] text-[13px]"
                        style={{ fontWeight: 700 }}
                      >
                        {conv.avatar}
                      </span>
                    </div>
                    {conv.online && (
                      <div className="absolute bottom-0 left-0 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span
                        className="text-gray-900 text-[14px] truncate"
                        style={{ fontWeight: 600 }}
                      >
                        {conv.name}
                      </span>
                      <span className="text-gray-400 text-[11px] shrink-0 mr-2">
                        {conv.lastTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-gray-500 text-[12px] truncate max-w-[220px]">
                        {conv.lastMessage}
                      </p>
                      {conv.unread > 0 && (
                        <span
                          className="bg-[#1e40af] text-white text-[10px] rounded-full min-w-[20px] h-[20px] flex items-center justify-center shrink-0 mr-2"
                          style={{ fontWeight: 700 }}
                        >
                          {conv.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-300 text-[11px] mt-0.5">{conv.role}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Messages View */
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50">
                {activeConv.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "me" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        msg.sender === "me"
                          ? "bg-[#1e40af] text-white rounded-br-md"
                          : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-md"
                      }`}
                    >
                      {/* Attachment */}
                      {msg.attachment && (
                        <div className="mb-2">
                          {msg.attachment.type === "image" ? (
                            <button
                              onClick={() => setLightboxUrl(msg.attachment!.url)}
                              className="block cursor-pointer rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
                            >
                              <img
                                src={msg.attachment.url}
                                alt={msg.attachment.name}
                                className="max-w-full max-h-[160px] rounded-lg object-cover"
                              />
                            </button>
                          ) : (
                            <div className="relative rounded-lg overflow-hidden bg-black/10">
                              <video
                                src={msg.attachment.url}
                                className="max-w-full max-h-[160px] rounded-lg"
                                controls
                                preload="metadata"
                              />
                            </div>
                          )}
                          <p
                            className={`text-[10px] mt-1 truncate ${
                              msg.sender === "me" ? "text-white/50" : "text-gray-400"
                            }`}
                          >
                            {msg.attachment.name}
                          </p>
                        </div>
                      )}

                      {msg.text && (
                        <p className="text-[13px]" style={{ lineHeight: 1.6 }}>
                          {msg.text}
                        </p>
                      )}
                      <div
                        className={`flex items-center gap-1 mt-1 ${
                          msg.sender === "me" ? "justify-start" : "justify-end"
                        }`}
                      >
                        <span
                          className={`text-[10px] ${
                            msg.sender === "me" ? "text-white/50" : "text-gray-400"
                          }`}
                        >
                          {msg.time}
                        </span>
                        {msg.sender === "me" &&
                          (msg.read ? (
                            <CheckCheck className="w-3 h-3 text-white/50" />
                          ) : (
                            <Check className="w-3 h-3 text-white/50" />
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Pending Attachment Preview */}
              {pendingAttachment && (
                <div className="px-4 py-2 border-t border-gray-100 bg-blue-50/50 flex items-center gap-3">
                  <div className="relative shrink-0">
                    {pendingAttachment.type === "image" ? (
                      <img
                        src={pendingAttachment.url}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover border border-blue-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center">
                        <Play className="w-5 h-5 text-blue-600" />
                      </div>
                    )}
                    <button
                      onClick={() => setPendingAttachment(null)}
                      className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-gray-700 truncate" style={{ fontWeight: 500 }}>
                      {pendingAttachment.name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {pendingAttachment.type === "image" ? "תמונה" : "סרטון"} מוכן לשליחה
                    </p>
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-2">
                  {/* Attach Button */}
                  <div className="relative" ref={attachMenuRef}>
                    <button
                      onClick={() => setShowAttachMenu(!showAttachMenu)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                        showAttachMenu
                          ? "bg-blue-100 text-blue-600"
                          : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <Paperclip className="w-[18px] h-[18px]" />
                    </button>

                    {/* Attach Menu Popup */}
                    {showAttachMenu && (
                      <div
                        className="absolute bottom-12 right-0 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 w-[150px] z-10"
                        dir="rtl"
                      >
                        <button
                          onClick={() => triggerFilePicker("image")}
                          className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-blue-50 transition-colors cursor-pointer text-right"
                        >
                          <ImageIcon className="w-4 h-4 text-emerald-500" />
                          <span className="text-[13px] text-gray-700" style={{ fontWeight: 500 }}>
                            תמונה
                          </span>
                        </button>
                        <button
                          onClick={() => triggerFilePicker("video")}
                          className="w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-blue-50 transition-colors cursor-pointer text-right"
                        >
                          <Video className="w-4 h-4 text-purple-500" />
                          <span className="text-[13px] text-gray-700" style={{ fontWeight: 500 }}>
                            סרטון
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder={pendingAttachment ? "הוסף/י הודעה (אופציונלי)..." : "כתוב/י הודעה..."}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-gray-50/50 transition-all"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim() && !pendingAttachment}
                    className="w-10 h-10 rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] disabled:bg-gray-200 text-white disabled:text-gray-400 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}