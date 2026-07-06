import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  CalendarPlus,
  Circle,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  User,
  Video,
  ExternalLink,
  Save,
  CheckCircle2,
  X,
} from "lucide-react";
import { supabase } from "../../services/supabaseClient";
import { DigitalCareAssistant } from "../components/ai/PageAssistants";
import { getStaffName } from "../data/staffAuth";
import { toast } from "sonner";

const CHAT_BUCKET = "chat-attachments";
const DEFAULT_STAFF_NAME = "צוות המרפאה";

type ConversationStatus = "open" | "waiting_owner" | "waiting_staff" | "closed";
type ConversationPriority = "low" | "normal" | "high" | "urgent";
type SenderType = "owner" | "staff" | "system";
type MessageType = "text" | "file" | "image" | "video_link" | "system";
type VideoStatus = "scheduled" | "active" | "completed" | "cancelled";
type ValidationErrors = Record<string, string>;

interface OwnerRow {
  owner_id: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface PetRow {
  pet_id: number;
  owner_id: string | null;
  pet_name: string | null;
  species: string | null;
  breed: string | null;
  gender: string | null;
  weight: number | null;
  birth_date: string | null;
}

interface ConversationRow {
  conversation_id: number;
  owner_id: string;
  pet_id: number | null;
  assigned_staff_id: string | null;
  subject: string;
  status: ConversationStatus;
  priority: ConversationPriority;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface MessageRow {
  message_id: number;
  conversation_id: number;
  sender_type: SenderType;
  sender_owner_id: string | null;
  sender_staff_id: string | null;
  sender_name: string | null;
  message_text: string | null;
  message_type: MessageType;
  is_read_by_owner: boolean;
  is_read_by_staff: boolean;
  created_at: string;
}

interface AttachmentRow {
  attachment_id: number;
  message_id: number | null;
  conversation_id: number;
  owner_id: string | null;
  pet_id: number | null;
  file_name: string;
  file_path: string;
  file_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by_type: SenderType;
  uploaded_at: string;
}

interface VideoSessionRow {
  session_id: number;
  conversation_id: number | null;
  owner_id: string | null;
  pet_id: number | null;
  staff_id: string | null;
  meeting_url: string | null;
  status: VideoStatus;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
}

interface ConversationVM extends ConversationRow {
  owner?: OwnerRow;
  pet?: PetRow;
  lastMessage?: MessageRow;
  unreadStaff: number;
  hasOpenVideo?: boolean;
}

const statusMeta: Record<ConversationStatus, { label: string; className: string }> = {
  open: { label: "פתוחה", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  waiting_owner: { label: "ממתין ללקוח", className: "bg-blue-50 text-blue-700 border-blue-200" },
  waiting_staff: { label: "ממתין לצוות", className: "bg-amber-50 text-amber-700 border-amber-200" },
  closed: { label: "נסגרה", className: "bg-gray-50 text-gray-600 border-gray-200" },
};

const priorityMeta: Record<ConversationPriority, { label: string; className: string; dot: string }> = {
  low: { label: "נמוכה", className: "bg-gray-50 text-gray-600 border-gray-200", dot: "bg-gray-300" },
  normal: { label: "רגילה", className: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
  high: { label: "גבוהה", className: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400" },
  urgent: { label: "דחופה", className: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
};

function ownerDisplayName(owner?: OwnerRow) {
  if (!owner) return "לקוח לא ידוע";
  return `${owner.owner_first_name || ""} ${owner.owner_last_name || ""}`.trim() || owner.owner_id;
}

function petDisplayName(pet?: PetRow) {
  if (!pet) return "ללא חיה משויכת";
  return pet.pet_name || `חיה #${pet.pet_id}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function getSafeFileExtension(fileName: string) {
  const parts = fileName.split(".");
  if (parts.length < 2) return "bin";
  const ext = parts.pop()?.toLowerCase() || "bin";
  return ext.replace(/[^a-z0-9]/g, "") || "bin";
}

function buildSafeChatPath(conversationId: number, fileName: string) {
  const ext = getSafeFileExtension(fileName);
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `conversation-${conversationId}/${Date.now()}-${unique}.${ext}`;
}

function getMessageType(file: File): MessageType {
  if (file.type.startsWith("image/")) return "image";
  return "file";
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function extractFirstUrl(text?: string | null) {
  return text?.match(/https?:\/\/\S+/)?.[0] || null;
}

function normalizeMeetUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[)\]}>.,;]+$/, "");
}

function isGoogleMeetUrl(value: string) {
  const normalized = normalizeMeetUrl(value);
  return /^https:\/\/meet\.google\.com\//i.test(normalized);
}

function sortConversations(list: ConversationVM[]) {
  return [...list].sort((a, b) => {
    const aDate = new Date(a.last_message_at || a.updated_at || a.created_at).getTime();
    const bDate = new Date(b.last_message_at || b.updated_at || b.created_at).getTime();
    return bDate - aDate;
  });
}

function createEmptyVideoSummary() {
  return {
    summary: "",
    recommendations: "",
    followUpRequired: false,
    followUpNotes: "",
  };
}

function hasError(errors: ValidationErrors, field: string) {
  return Boolean(errors[field]);
}

function errorClass(errors: ValidationErrors, field: string) {
  return hasError(errors, field) ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-500/10" : "border-gray-200 focus:border-blue-400 focus:ring-blue-500/10";
}

function ErrorText({ errors, field }: { errors: ValidationErrors; field: string }) {
  if (!errors[field]) return null;
  return <p className="text-red-500 text-[12px] font-semibold mt-2">{errors[field]}</p>;
}


export function DigitalCare() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeFilter = searchParams.get("filter");
  const routePriority = searchParams.get("priority");
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [pets, setPets] = useState<PetRow[]>([]);
  const [conversations, setConversations] = useState<ConversationVM[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [videoSessions, setVideoSessions] = useState<VideoSessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ConversationStatus>("all");
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newConversation, setNewConversation] = useState({ owner_id: "", pet_id: "", subject: "", priority: "normal" as ConversationPriority });
  const [videoModal, setVideoModal] = useState<VideoSessionRow | null>(null);
  const [isMeetLinkModalOpen, setIsMeetLinkModalOpen] = useState(false);
  const [meetLinkInput, setMeetLinkInput] = useState("");
  const [meetLinkError, setMeetLinkError] = useState<string | null>(null);
  const [summaryModalSession, setSummaryModalSession] = useState<VideoSessionRow | null>(null);
  const [videoSummary, setVideoSummary] = useState(createEmptyVideoSummary());
  const [videoSummaryErrors, setVideoSummaryErrors] = useState<ValidationErrors>({});
  const [savingSummary, setSavingSummary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find((c) => c.conversation_id === selectedId) || null;
  const selectedOwner = selectedConversation?.owner;
  const selectedPet = selectedConversation?.pet;
  const ownerPets = selectedOwner ? pets.filter((p) => p.owner_id === selectedOwner.owner_id) : [];
  const showOpenOnly = routeFilter === "open";
  const showVideoOnly = routeFilter === "video";
  const showUrgentOnly = routeFilter === "urgent" || routePriority === "urgent";

  const metrics = useMemo(() => {
    const open = conversations.filter((c) => c.status !== "closed").length;
    const waitingStaff = conversations.filter((c) => c.status === "waiting_staff").length;
    const unread = conversations.reduce((sum, c) => sum + c.unreadStaff, 0);
    const video = conversations.filter((c) => c.hasOpenVideo && c.status !== "closed").length;
    return { open, waitingStaff, unread, video };
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortConversations(conversations).filter((conversation) => {
      if (showOpenOnly && conversation.status === "closed") return false;
      if (showVideoOnly && !conversation.hasOpenVideo) return false;
      if (showUrgentOnly && !(conversation.priority === "urgent" || conversation.priority === "high")) return false;
      if (statusFilter !== "all" && conversation.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        conversation.subject,
        ownerDisplayName(conversation.owner),
        conversation.owner?.phone || "",
        conversation.owner_id,
        petDisplayName(conversation.pet),
        conversation.lastMessage?.message_text || "",
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [conversations, search, statusFilter, showOpenOnly, showVideoOnly, showUrgentOnly]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [ownersResult, petsResult, conversationsResult] = await Promise.all([
        supabase.from("owners").select("owner_id, owner_first_name, owner_last_name, phone, email, address"),
        supabase.from("patients").select("pet_id, owner_id, pet_name, species, breed, gender, weight, birth_date"),
        supabase.from("conversations").select("*").order("updated_at", { ascending: false }),
      ]);

      if (ownersResult.error) throw ownersResult.error;
      if (petsResult.error) throw petsResult.error;
      if (conversationsResult.error) throw conversationsResult.error;

      const ownersData = (ownersResult.data || []) as OwnerRow[];
      const petsData = (petsResult.data || []) as PetRow[];
      const conversationsData = (conversationsResult.data || []) as ConversationRow[];

      const conversationIds = conversationsData.map((c) => c.conversation_id);
      let messagesData: MessageRow[] = [];
      let allVideoSessions: VideoSessionRow[] = [];
      if (conversationIds.length > 0) {
        const { data, error: messagesError } = await supabase
          .from("messages")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true });
        if (messagesError) throw messagesError;
        messagesData = (data || []) as MessageRow[];

        const { data: videoRows, error: videoError } = await supabase
          .from("video_sessions")
          .select("*")
          .in("conversation_id", conversationIds);
        if (videoError) throw videoError;
        allVideoSessions = (videoRows || []) as VideoSessionRow[];
      }

      const ownerMap = new Map(ownersData.map((owner) => [owner.owner_id, owner]));
      const petMap = new Map(petsData.map((pet) => [Number(pet.pet_id), pet]));
      const vm = conversationsData.map((conversation) => {
        const convMessages = messagesData.filter((msg) => msg.conversation_id === conversation.conversation_id);
        const lastMessage = convMessages[convMessages.length - 1];
        const unreadStaff = convMessages.filter((msg) => msg.sender_type === "owner" && !msg.is_read_by_staff).length;
        const hasOpenVideo = allVideoSessions.some((session) =>
          session.conversation_id === conversation.conversation_id &&
          session.status !== "completed" &&
          session.status !== "cancelled"
        );
        return {
          ...conversation,
          owner: ownerMap.get(conversation.owner_id),
          pet: conversation.pet_id ? petMap.get(Number(conversation.pet_id)) : undefined,
          lastMessage,
          unreadStaff,
          hasOpenVideo,
        } as ConversationVM;
      });

      setOwners(ownersData);
      setPets(petsData);
      setConversations(vm);
      const sorted = sortConversations(vm);
      const preferredConversation = sorted.find((conversation) => {
        if (routeFilter === "open") return conversation.status !== "closed";
        if (routeFilter === "video") return Boolean(conversation.hasOpenVideo);
        if (routeFilter === "urgent" || routePriority === "urgent") return conversation.status !== "closed" && (conversation.priority === "urgent" || conversation.priority === "high");
        return true;
      });
      if (!selectedId || routeFilter || routePriority) setSelectedId(preferredConversation?.conversation_id || sorted[0]?.conversation_id || null);
    } catch (err) {
      console.error("Failed loading digital care data", err);
      setError("לא הצלחנו לטעון את נתוני המרפאה הדיגיטלית");
    } finally {
      setLoading(false);
    }
  }

  async function loadConversationDetails(conversationId: number) {
    setMessagesLoading(true);
    setError(null);
    try {
      const [messagesResult, attachmentsResult, videoResult] = await Promise.all([
        supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }),
        supabase.from("message_attachments").select("*").eq("conversation_id", conversationId).order("uploaded_at", { ascending: true }),
        supabase.from("video_sessions").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }),
      ]);
      if (messagesResult.error) throw messagesResult.error;
      if (attachmentsResult.error) throw attachmentsResult.error;
      if (videoResult.error) throw videoResult.error;
      setMessages((messagesResult.data || []) as MessageRow[]);
      setAttachments((attachmentsResult.data || []) as AttachmentRow[]);
      setVideoSessions((videoResult.data || []) as VideoSessionRow[]);

      await supabase
        .from("messages")
        .update({ is_read_by_staff: true })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "owner");

      setConversations((prev) => prev.map((conversation) => (
        conversation.conversation_id === conversationId ? { ...conversation, unreadStaff: 0 } : conversation
      )));
    } catch (err) {
      console.error("Failed loading messages", err);
      setError("לא הצלחנו לטעון את השיחה");
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [routeFilter, routePriority]);

  useEffect(() => {
    if (selectedId) loadConversationDetails(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, selectedId]);

  async function updateConversation(conversationId: number, patch: Partial<ConversationRow>) {
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("conversation_id", conversationId);
    if (updateError) throw updateError;
    setConversations((prev) => prev.map((conversation) => (
      conversation.conversation_id === conversationId ? { ...conversation, ...patch, updated_at: new Date().toISOString() } : conversation
    )));
  }

  async function sendMessage(text?: string, type: MessageType = "text") {
    if (!selectedConversation) return;
    const content = (text ?? messageText).trim();
    if (!content) return;
    setSending(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const { data, error: insertError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.conversation_id,
          sender_type: "staff",
          sender_staff_id: null,
          sender_name: DEFAULT_STAFF_NAME,
          message_text: content,
          message_type: type,
          is_read_by_owner: false,
          is_read_by_staff: true,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      await supabase
        .from("conversations")
        .update({
          status: "waiting_owner",
          last_message_at: now,
          updated_at: now,
        })
        .eq("conversation_id", selectedConversation.conversation_id);

      const inserted = data as MessageRow;
      setMessages((prev) => [...prev, inserted]);
      setConversations((prev) => prev.map((conversation) => (
        conversation.conversation_id === selectedConversation.conversation_id
          ? { ...conversation, status: "waiting_owner", last_message_at: now, updated_at: now, lastMessage: inserted }
          : conversation
      )));
      setMessageText("");
    } catch (err) {
      console.error("Failed sending message", err);
      setError("שליחת ההודעה נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function handleFileUpload(file: File) {
    if (!selectedConversation) return;
    setSending(true);
    setError(null);
    try {
      const filePath = buildSafeChatPath(selectedConversation.conversation_id, file.name);
      const { error: uploadError } = await supabase.storage
        .from(CHAT_BUCKET)
        .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;

      const messageType = getMessageType(file);
      const messageLabel = messageType === "image" ? "תמונה צורפה לשיחה" : "קובץ צורף לשיחה";
      const { data: messageData, error: messageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.conversation_id,
          sender_type: "staff",
          sender_staff_id: null,
          sender_name: DEFAULT_STAFF_NAME,
          message_text: `${messageLabel}: ${file.name}`,
          message_type: messageType,
          is_read_by_owner: false,
          is_read_by_staff: true,
        })
        .select()
        .single();
      if (messageError) throw messageError;

      const insertedMessage = messageData as MessageRow;
      const { data: attachmentData, error: attachmentError } = await supabase
        .from("message_attachments")
        .insert({
          message_id: insertedMessage.message_id,
          conversation_id: selectedConversation.conversation_id,
          owner_id: selectedConversation.owner_id,
          pet_id: selectedConversation.pet_id,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          uploaded_by_type: "staff",
        })
        .select()
        .single();
      if (attachmentError) throw attachmentError;

      const now = new Date().toISOString();
      await supabase
        .from("conversations")
        .update({ status: "waiting_owner", last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversation.conversation_id);

      setMessages((prev) => [...prev, insertedMessage]);
      setAttachments((prev) => [...prev, attachmentData as AttachmentRow]);
      setConversations((prev) => prev.map((conversation) => (
        conversation.conversation_id === selectedConversation.conversation_id
          ? { ...conversation, status: "waiting_owner", last_message_at: now, updated_at: now, lastMessage: insertedMessage }
          : conversation
      )));
    } catch (err) {
      console.error("Failed uploading chat attachment", err);
      setError("העלאת הקובץ לשיחה נכשלה. בדוק הרשאות Storage או שם Bucket");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openAttachment(attachment: AttachmentRow) {
    try {
      const { data, error: signedError } = await supabase.storage
        .from(CHAT_BUCKET)
        .createSignedUrl(attachment.file_path, 60 * 10);
      if (signedError) throw signedError;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed opening attachment", err);
      setError("לא הצלחנו לפתוח את הקובץ");
    }
  }

  async function createConversation() {
    if (!newConversation.owner_id) {
      setError("יש לבחור לקוח לפתיחת שיחה");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const petId = newConversation.pet_id ? Number(newConversation.pet_id) : null;
      const { data, error: insertError } = await supabase
        .from("conversations")
        .insert({
          owner_id: newConversation.owner_id,
          pet_id: petId,
          subject: newConversation.subject.trim() || "פנייה כללית",
          priority: newConversation.priority,
          status: "open",
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const created = data as ConversationRow;
      await supabase.from("messages").insert({
        conversation_id: created.conversation_id,
        sender_type: "system",
        sender_name: "מערכת",
        message_text: "שיחה חדשה נפתחה על ידי צוות המרפאה.",
        message_type: "system",
        is_read_by_owner: false,
        is_read_by_staff: true,
      });

      setIsNewModalOpen(false);
      setNewConversation({ owner_id: "", pet_id: "", subject: "", priority: "normal" });
      await loadData();
      setSelectedId(created.conversation_id);
    } catch (err) {
      console.error("Failed creating conversation", err);
      setError("פתיחת השיחה נכשלה");
    } finally {
      setSending(false);
    }
  }

  function getLatestActiveVideoSession() {
    return videoSessions.find((session) =>
      session.meeting_url && session.status !== "completed" && session.status !== "cancelled"
    ) || null;
  }

  function startVideoSession() {
    if (!selectedConversation) return;
    const existingSession = getLatestActiveVideoSession();
    if (existingSession?.meeting_url) {
      setVideoModal(existingSession);
      return;
    }

    setMeetLinkInput("");
    setMeetLinkError(null);
    setIsMeetLinkModalOpen(true);
  }

  async function createMeetVideoSession() {
    if (!selectedConversation) return;

    const meetingUrl = normalizeMeetUrl(meetLinkInput);
    if (!isGoogleMeetUrl(meetingUrl)) {
      setMeetLinkError("יש להדביק קישור Google Meet תקין שמתחיל ב-https://meet.google.com/");
      return;
    }

    setSending(true);
    setError(null);
    setMeetLinkError(null);

    try {
      const now = new Date().toISOString();
      const pendingRequest = videoSessions.find((session) =>
        !session.meeting_url && session.status !== "completed" && session.status !== "cancelled"
      );

      const videoQuery = pendingRequest
        ? supabase
            .from("video_sessions")
            .update({
              meeting_url: meetingUrl,
              status: "scheduled",
              scheduled_at: pendingRequest.scheduled_at || now,
              notes: "קישור Google Meet שנוצר/הודבק על ידי צוות המרפאה בעקבות בקשת לקוח",
            })
            .eq("session_id", pendingRequest.session_id)
            .select()
            .single()
        : supabase
            .from("video_sessions")
            .insert({
              conversation_id: selectedConversation.conversation_id,
              owner_id: selectedConversation.owner_id,
              pet_id: selectedConversation.pet_id,
              staff_id: null,
              meeting_url: meetingUrl,
              status: "scheduled",
              scheduled_at: now,
              notes: "קישור Google Meet שנוצר/הודבק על ידי צוות המרפאה",
            })
            .select()
            .single();

      const { data, error: videoError } = await videoQuery;
      if (videoError) throw videoError;

      const { error: messageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: selectedConversation.conversation_id,
          sender_type: "system",
          sender_name: "מערכת MyVet",
          message_text: `קישור לשיחת Google Meet עם צוות המרפאה: ${meetingUrl}`,
          message_type: "video_link",
          is_read_by_owner: false,
          is_read_by_staff: true,
        });
      if (messageError) throw messageError;

      await supabase
        .from("conversations")
        .update({ status: "waiting_owner", last_message_at: now, updated_at: now })
        .eq("conversation_id", selectedConversation.conversation_id);

      const session = data as VideoSessionRow;
      setVideoSessions((prev) => [session, ...prev]);
      setVideoModal(session);
      setIsMeetLinkModalOpen(false);
      setMeetLinkInput("");
      await loadConversationDetails(selectedConversation.conversation_id);
      await loadData();
    } catch (err) {
      console.error("Failed creating Google Meet session", err);
      setError("שמירת קישור Google Meet נכשלה");
    } finally {
      setSending(false);
    }
  }

  async function openMeetSession(session: VideoSessionRow) {
    if (!session.meeting_url) return;

    try {
      if (session.status === "scheduled") {
        const startedAt = new Date().toISOString();
        await supabase
          .from("video_sessions")
          .update({ status: "active", started_at: startedAt })
          .eq("session_id", session.session_id);
        setVideoSessions((prev) => prev.map((item) =>
          item.session_id === session.session_id ? { ...item, status: "active", started_at: startedAt } : item
        ));
        setVideoModal({ ...session, status: "active", started_at: startedAt });
      }
    } catch (err) {
      console.error("Failed updating video session status", err);
    }

    window.open(session.meeting_url, "_blank", "noopener,noreferrer");
  }

  async function endVideoSession() {
    if (!videoModal) return;
    try {
      const { error: updateError } = await supabase
        .from("video_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("session_id", videoModal.session_id);
      if (updateError) throw updateError;
      setVideoSessions((prev) => prev.map((session) => (
        session.session_id === videoModal.session_id ? { ...session, status: "completed", ended_at: new Date().toISOString() } : session
      )));
      setVideoModal(null);
    } catch (err) {
      console.error("Failed ending video session", err);
      setError("סיום שיחת הווידאו נכשל");
    }
  }


  function openVideoSummaryModal(session: VideoSessionRow) {
    setVideoModal(null);
    setSummaryModalSession(session);
    setVideoSummary(createEmptyVideoSummary());
    setVideoSummaryErrors({});
  }

  function validateVideoSummary() {
    const errors: ValidationErrors = {};

    if (!selectedConversation) errors.conversation = "יש לבחור שיחה לפני שמירת סיכום";
    if (!selectedPet?.pet_id) errors.pet = "אי אפשר לשמור לתיק רפואי בלי חיה משויכת לשיחה";
    if (!videoSummary.summary.trim()) errors.summary = "חובה לכתוב סיכום קצר של שיחת הווידאו";
    if (videoSummary.summary.trim().length < 8) errors.summary = "הסיכום קצר מדי. כתוב לפחות משפט אחד ברור";
    if (videoSummary.followUpRequired && !videoSummary.followUpNotes.trim()) {
      errors.followUpNotes = "סימנת שנדרש מעקב, לכן חובה לציין מה צריך לעשות בהמשך";
    }

    setVideoSummaryErrors(errors);
    return errors;
  }

  async function saveVideoSummaryToMedicalRecord() {
    if (!summaryModalSession || !selectedConversation) return;

    const errors = validateVideoSummary();
    if (Object.keys(errors).length > 0) {
      toast.error("חסר מידע לשמירת סיכום שיחת הווידאו");
      return;
    }

    setSavingSummary(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const staffName = getStaffName();
      const summaryText = videoSummary.summary.trim();
      const recommendationsText = videoSummary.recommendations.trim();
      const followUpText = videoSummary.followUpNotes.trim();

      const notes = [
        `סיכום שיחת וידאו מתוך המרפאה הדיגיטלית.`,
        `מספר שיחה דיגיטלית: ${selectedConversation.conversation_id}`,
        `מספר סשן וידאו: ${summaryModalSession.session_id}`,
        recommendationsText ? `הנחיות / המלצות שנמסרו: ${recommendationsText}` : "",
        followUpText ? `מעקב נדרש: ${followUpText}` : "",
      ].filter(Boolean).join("\n");

      const { data, error: visitError } = await supabase
        .from("medical_visits")
        .insert({
          appointment_id: null,
          pet_id: selectedPet!.pet_id,
          visit_date: now,
          vet_name: staffName || DEFAULT_STAFF_NAME,
          reason: selectedConversation.subject || "שיחת וידאו",
          diagnosis: null,
          treatment: summaryText,
          notes,
          attachments: "0",
          visit_type: "video_consultation",
          urgency_level: selectedConversation.priority === "urgent" ? "serious" : "normal",
          chief_complaint: selectedConversation.subject || "שיחת וידאו",
          final_diagnosis: null,
          follow_up_required: Boolean(videoSummary.followUpRequired),
          follow_up_notes: followUpText || null,
          entry_data: {
            entryType: "video_consultation",
            label: "סיכום שיחת וידאו",
            source: "digital-care",
            conversationId: selectedConversation.conversation_id,
            videoSessionId: summaryModalSession.session_id,
            summary: summaryText,
            recommendations: recommendationsText || null,
            followUpRequired: Boolean(videoSummary.followUpRequired),
            followUpNotes: followUpText || null,
            savedAt: now,
          },
        })
        .select("visit_id")
        .single();

      if (visitError) throw visitError;

      await supabase
        .from("video_sessions")
        .update({
          status: "completed",
          ended_at: summaryModalSession.ended_at || now,
          notes: summaryText,
        })
        .eq("session_id", summaryModalSession.session_id);

      await supabase.from("messages").insert({
        conversation_id: selectedConversation.conversation_id,
        sender_type: "system",
        sender_name: "מערכת MyVet",
        message_text: `סיכום שיחת וידאו נשמר בתיק הרפואי. מספר רשומה: ${data?.visit_id ?? "חדש"}`,
        message_type: "system",
        is_read_by_owner: false,
        is_read_by_staff: true,
      });

      await supabase
        .from("conversations")
        .update({ updated_at: now, last_message_at: now })
        .eq("conversation_id", selectedConversation.conversation_id);

      setVideoSessions((prev) => prev.map((session) => (
        session.session_id === summaryModalSession.session_id
          ? { ...session, status: "completed", ended_at: summaryModalSession.ended_at || now, notes: summaryText }
          : session
      )));

      setSummaryModalSession(null);
      setVideoSummary(createEmptyVideoSummary());
      setVideoSummaryErrors({});
      toast.success("סיכום שיחת הווידאו נשמר בתיק הרפואי");
      await loadConversationDetails(selectedConversation.conversation_id);
      await loadData();
    } catch (err) {
      console.error("Failed saving video summary to medical record", err);
      setError("שמירת סיכום שיחת הווידאו לתיק הרפואי נכשלה");
      toast.error("לא הצלחנו לשמור את הסיכום לתיק הרפואי");
    } finally {
      setSavingSummary(false);
    }
  }

  const attachmentsByMessage = useMemo(() => {
    const map = new Map<number, AttachmentRow[]>();
    attachments.forEach((attachment) => {
      if (!attachment.message_id) return;
      const current = map.get(attachment.message_id) || [];
      current.push(attachment);
      map.set(attachment.message_id, current);
    });
    return map;
  }, [attachments]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f8fb] px-6 py-8" style={{ fontFamily: "'Heebo', sans-serif" }}>
      <div className="max-w-[1500px] mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-[#1e40af] px-3 py-1 rounded-full text-[12px] font-semibold mb-3">
              <MessageCircle className="w-3.5 h-3.5" /> מרפאה דיגיטלית
            </div>
            <h1 className="text-gray-900 text-[30px] font-bold mb-1">תקשורת עם לקוחות</h1>
            <p className="text-gray-500 text-[15px] font-medium">צ׳אט, קבצים, שיחות וידאו וקישור מהיר לתיקי החיות.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DigitalCareAssistant conversation={selectedConversation} messages={messages} attachments={attachments} />
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] text-white px-5 py-3 rounded-2xl text-[14px] font-semibold shadow-lg shadow-blue-500/15 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> שיחה חדשה
            </button>
            <button
              onClick={loadData}
              className="px-4 py-3 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-[13px] font-semibold transition-colors cursor-pointer"
            >
              רענן
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 flex items-center gap-2 text-[14px] font-medium">
            <AlertCircle className="w-5 h-5" /> {error}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(320px,1.25fr)_repeat(3,minmax(180px,1fr))] gap-4">
          <DigitalCareCommandCard
            open={metrics.open}
            waitingStaff={metrics.waitingStaff}
            unread={metrics.unread}
            video={metrics.video}
            onShowWaiting={() => setStatusFilter("waiting_staff")}
            onShowVideo={() => navigate("/digital-care?filter=video")}
            onNewConversation={() => setIsNewModalOpen(true)}
          />
          <MetricCard
            icon={<MessageCircle className="w-5 h-5" />}
            title="שיחות פתוחות"
            value={metrics.open}
            tone="blue"
            subtitle="שיחות שעדיין בטיפול"
          />
          <MetricCard
            icon={<Clock className="w-5 h-5" />}
            title="ממתינות לצוות"
            value={metrics.waitingStaff}
            tone="amber"
            subtitle="כדאי להתחיל מהן"
          />
          <MetricCard
            icon={<Circle className="w-5 h-5" />}
            title="הודעות שלא נקראו"
            value={metrics.unread}
            tone="emerald"
            subtitle="הודעות חדשות מלקוחות"
          />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_330px] gap-5 items-start">
          <aside className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden min-h-[680px]">
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לקוח, חיה, טלפון או נושא..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl pr-10 pl-4 py-3 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "הכל" },
                  { key: "open", label: "פתוחות" },
                  { key: "waiting_staff", label: "ממתינות" },
                  { key: "closed", label: "סגורות" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setStatusFilter(item.key as "all" | ConversationStatus)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all cursor-pointer ${statusFilter === item.key ? "bg-[#1e40af] text-white border-[#1e40af]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[610px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> טוען שיחות...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-16 px-5">
                  <MessageCircle className="w-10 h-10 mx-auto text-gray-200 mb-3" />
                  <p className="text-gray-500 text-[14px] font-semibold">לא נמצאו שיחות</p>
                  <p className="text-gray-400 text-[12px] mt-1">פתח שיחה חדשה או שנה סינון.</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <button
                    key={conversation.conversation_id}
                    onClick={() => setSelectedId(conversation.conversation_id)}
                    className={`w-full text-right px-4 py-4 border-b border-gray-50 hover:bg-blue-50/40 transition-all cursor-pointer ${selectedId === conversation.conversation_id ? "bg-blue-50/70 border-r-4 border-r-[#1e40af]" : "border-r-4 border-r-transparent"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-[#1e40af] flex items-center justify-center font-bold text-[13px]">
                          {ownerDisplayName(conversation.owner).slice(0, 2)}
                        </div>
                        {conversation.unreadStaff > 0 && (
                          <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white">
                            {conversation.unreadStaff}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="text-gray-900 text-[14px] font-bold truncate">{ownerDisplayName(conversation.owner)}</h3>
                          <span className="text-gray-400 text-[11px] shrink-0">{formatDateTime(conversation.last_message_at || conversation.updated_at)}</span>
                        </div>
                        <p className="text-gray-500 text-[12px] truncate mb-2">{petDisplayName(conversation.pet)} · {conversation.subject}</p>
                        <p className="text-gray-600 text-[12px] truncate mb-2">{conversation.lastMessage?.message_text || "אין הודעות עדיין"}</p>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusMeta[conversation.status].className}`}>{statusMeta[conversation.status].label}</span>
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${priorityMeta[conversation.priority].className}`}>{priorityMeta[conversation.priority].label}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <main className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden min-h-[680px] flex flex-col">
            {!selectedConversation ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <MessageCircle className="w-14 h-14 text-gray-200 mb-4" />
                <h2 className="text-gray-900 text-[20px] font-bold mb-2">בחר שיחה לניהול</h2>
                <p className="text-gray-500 text-[14px]">בחר שיחה מהרשימה או פתח שיחה חדשה מול לקוח.</p>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1e40af] flex items-center justify-center">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-gray-900 text-[17px] font-bold truncate">{selectedConversation.subject}</h2>
                      <p className="text-gray-500 text-[13px] truncate">{ownerDisplayName(selectedOwner)} · {petDisplayName(selectedPet)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={selectedConversation.status}
                      onChange={(e) => updateConversation(selectedConversation.conversation_id, { status: e.target.value as ConversationStatus, closed_at: e.target.value === "closed" ? new Date().toISOString() : null })}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-semibold outline-none"
                    >
                      <option value="open">פתוחה</option>
                      <option value="waiting_owner">ממתין ללקוח</option>
                      <option value="waiting_staff">ממתין לצוות</option>
                      <option value="closed">סגורה</option>
                    </select>
                    <button onClick={startVideoSession} className="flex items-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl px-3 py-2 text-[12px] font-semibold cursor-pointer">
                      <Video className="w-4 h-4" /> וידאו
                    </button>
                    {videoSessions.length > 0 && (
                      <button
                        onClick={() => openVideoSummaryModal(videoSessions[0])}
                        className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-2 text-[12px] font-semibold cursor-pointer"
                      >
                        <Save className="w-4 h-4" /> סכם לתיק
                      </button>
                    )}
                  </div>
                </div>

                <div ref={messagesScrollRef} className="flex-1 bg-[#f8fafc] px-5 py-5 overflow-y-auto max-h-[520px] space-y-4 overscroll-contain">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" /> טוען הודעות...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-20">
                      <MessageCircle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-500 text-[14px] font-semibold">אין הודעות בשיחה</p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isStaff = message.sender_type === "staff";
                      const isSystem = message.sender_type === "system";
                      const msgAttachments = attachmentsByMessage.get(message.message_id) || [];
                      return (
                        <div key={message.message_id} className={`flex ${isSystem ? "justify-center" : isStaff ? "justify-start" : "justify-end"}`}>
                          {isSystem ? (
                            <div className="bg-white/80 border border-gray-200 rounded-full px-4 py-2 text-[12px] text-gray-500 font-medium">
                              {message.message_text}
                            </div>
                          ) : (
                            <div className={`max-w-[76%] rounded-3xl px-4 py-3 shadow-sm ${isStaff ? "bg-[#1e40af] text-white rounded-bl-lg" : "bg-white border border-gray-100 text-gray-800 rounded-br-lg"}`}>
                              <div className="flex items-center gap-2 mb-1 opacity-75 text-[11px]">
                                <span>{message.sender_name || (isStaff ? DEFAULT_STAFF_NAME : ownerDisplayName(selectedOwner))}</span>
                                <span>{formatTime(message.created_at)}</span>
                              </div>
                              <p className="text-[14px] leading-relaxed whitespace-pre-line">{message.message_text}</p>
                              {message.message_type === "video_link" && extractFirstUrl(message.message_text) && (
                                <button
                                  onClick={() => window.open(extractFirstUrl(message.message_text) || "", "_blank", "noopener,noreferrer")}
                                  className={`mt-3 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[12px] font-bold transition-colors ${isStaff ? "bg-white/15 hover:bg-white/25 text-white border border-white/20" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"}`}
                                >
                                  <Video className="w-4 h-4" /> הצטרף לשיחת Google Meet
                                </button>
                              )}
                              {msgAttachments.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {msgAttachments.map((attachment) => (
                                    <button
                                      key={attachment.attachment_id}
                                      onClick={() => openAttachment(attachment)}
                                      className={`w-full flex items-center gap-2 rounded-2xl border px-3 py-2 text-right cursor-pointer ${isStaff ? "bg-white/10 border-white/20 text-white hover:bg-white/20" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"}`}
                                    >
                                      {attachment.mime_type?.startsWith("image/") ? <ImageIcon className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
                                      <span className="flex-1 truncate text-[12px] font-semibold">{attachment.file_name}</span>
                                      <span className="text-[10px] opacity-70">{formatFileSize(attachment.file_size)}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div />
                </div>

                <div className="border-t border-gray-100 bg-white p-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      className="w-11 h-11 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 flex items-center justify-center cursor-pointer disabled:opacity-50"
                      title="צרף קובץ"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="כתוב הודעה ללקוח..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={sending || !messageText.trim()}
                      className="w-11 h-11 rounded-2xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                    >
                      {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 rotate-180" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>

          <aside className="bg-white border border-gray-100 rounded-3xl shadow-sm p-5 min-h-[680px]">
            {!selectedConversation ? (
              <div className="text-center py-16">
                <User className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-[14px] font-semibold">בחר שיחה להצגת פרטי לקוח</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-gray-900 text-[18px] font-bold mb-1">{ownerDisplayName(selectedOwner)}</h3>
                  <p className="text-gray-500 text-[13px]">{selectedOwner?.owner_id}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 text-[13px]">
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="טלפון" value={selectedOwner?.phone || "לא הוזן"} />
                  <InfoRow icon={<MessageCircle className="w-4 h-4" />} label="אימייל" value={selectedOwner?.email || "לא הוזן"} />
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-gray-900 text-[14px] font-bold mb-3">החיות של הלקוח</h4>
                  <div className="space-y-2">
                    {ownerPets.length === 0 ? (
                      <p className="text-gray-400 text-[13px]">אין חיות משויכות</p>
                    ) : ownerPets.map((pet) => (
                      <div key={pet.pet_id} className={`rounded-2xl border p-3 ${pet.pet_id === selectedPet?.pet_id ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-gray-900 text-[13px] font-bold">{petDisplayName(pet)}</p>
                            <p className="text-gray-500 text-[12px]">{pet.species || "סוג לא ידוע"} · {pet.breed || "גזע לא ידוע"}</p>
                          </div>
                          <button onClick={() => navigate(`/patients?selected=${pet.pet_id}`)} className="text-[#1e40af] text-[12px] font-semibold hover:underline cursor-pointer">
                            תיק
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <Link to={`/clients`} className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
                    פתח כרטיס לקוח <ArrowLeft className="w-4 h-4" />
                  </Link>
                  {selectedOwner && (
                    <Link to={`/portal?owner_id=${selectedOwner.owner_id}`} className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
                      פתח פורטל לקוח <ArrowLeft className="w-4 h-4" />
                    </Link>
                  )}
                  <Link to="/appointments/new" className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] font-semibold text-[#1e40af] hover:bg-blue-100">
                    קבע תור מתוך השיחה <CalendarPlus className="w-4 h-4" />
                  </Link>
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <h4 className="text-gray-900 text-[14px] font-bold mb-3">שיחות וידאו</h4>
                  {videoSessions.length === 0 ? (
                    <p className="text-gray-400 text-[13px]">אין שיחות וידאו לשיחה זו</p>
                  ) : (
                    <div className="space-y-2">
                      {videoSessions.slice(0, 3).map((session) => (
                        <div key={session.session_id} className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3 space-y-2">
                          <button onClick={() => setVideoModal(session)} className="w-full text-right hover:bg-emerald-100 rounded-xl px-2 py-1 cursor-pointer">
                            <p className="text-emerald-800 text-[13px] font-bold">Google Meet #{session.session_id}</p>
                            <p className="text-emerald-600 text-[12px]">{session.status} · {formatDateTime(session.created_at)}</p>
                          </button>
                          {selectedPet?.pet_id ? (
                            <button
                              onClick={() => openVideoSummaryModal(session)}
                              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-2 text-[12px] font-bold cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" /> סכם לתיק הרפואי
                            </button>
                          ) : (
                            <p className="text-amber-600 text-[11px] font-semibold px-2">כדי לשמור סיכום לתיק יש לשייך חיה לשיחה</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>

      {isNewModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-gray-900 text-[19px] font-bold">פתיחת שיחה חדשה</h3>
                <p className="text-gray-500 text-[13px]">בחר לקוח, חיה ונושא פנייה.</p>
              </div>
              <button onClick={() => setIsNewModalOpen(false)} className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center cursor-pointer">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-gray-700 text-[13px] font-semibold mb-2">לקוח</label>
                <select
                  value={newConversation.owner_id}
                  onChange={(e) => setNewConversation((prev) => ({ ...prev, owner_id: e.target.value, pet_id: "" }))}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-blue-400"
                >
                  <option value="">בחר לקוח</option>
                  {owners.map((owner) => (
                    <option key={owner.owner_id} value={owner.owner_id}>{ownerDisplayName(owner)} · {owner.owner_id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 text-[13px] font-semibold mb-2">חיה</label>
                <select
                  value={newConversation.pet_id}
                  onChange={(e) => setNewConversation((prev) => ({ ...prev, pet_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-blue-400"
                  disabled={!newConversation.owner_id}
                >
                  <option value="">ללא חיה / כללי</option>
                  {pets.filter((pet) => pet.owner_id === newConversation.owner_id).map((pet) => (
                    <option key={pet.pet_id} value={pet.pet_id}>{petDisplayName(pet)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 text-[13px] font-semibold mb-2">נושא</label>
                <input
                  value={newConversation.subject}
                  onChange={(e) => setNewConversation((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="לדוגמה: התייעצות אחרי טיפול"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-gray-700 text-[13px] font-semibold mb-2">עדיפות</label>
                <select
                  value={newConversation.priority}
                  onChange={(e) => setNewConversation((prev) => ({ ...prev, priority: e.target.value as ConversationPriority }))}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-blue-400"
                >
                  <option value="low">נמוכה</option>
                  <option value="normal">רגילה</option>
                  <option value="high">גבוהה</option>
                  <option value="urgent">דחופה</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button onClick={createConversation} disabled={sending || !newConversation.owner_id} className="flex-1 bg-[#1e40af] hover:bg-[#1e3a8a] disabled:opacity-50 text-white rounded-2xl py-3 text-[14px] font-bold cursor-pointer">
                פתח שיחה
              </button>
              <button onClick={() => setIsNewModalOpen(false)} className="px-5 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold cursor-pointer hover:bg-white">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {isMeetLinkModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[12px] font-bold mb-3">
                  <Video className="w-3.5 h-3.5" /> Google Meet
                </div>
                <h3 className="text-gray-900 text-[20px] font-bold">יצירת שיחת וידאו</h3>
                <p className="text-gray-500 text-[13px] mt-1 leading-6">
                  פתחו Google Meet, העתיקו את הקישור שנוצר, והדביקו אותו כאן. אותו קישור יישמר בשיחה ויופיע גם בפורטל הלקוח.
                </p>
              </div>
              <button onClick={() => setIsMeetLinkModalOpen(false)} className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center cursor-pointer">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <button
                onClick={() => window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer")}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-3 text-[14px] font-bold cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" /> פתח Google Meet חדש
              </button>
              <div>
                <label className="block text-gray-700 text-[13px] font-semibold mb-2">הדבקת קישור השיחה</label>
                <input
                  value={meetLinkInput}
                  onChange={(e) => setMeetLinkInput(e.target.value)}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 ltr:text-left"
                  dir="ltr"
                />
                {meetLinkError && <p className="text-red-500 text-[12px] font-semibold mt-2">{meetLinkError}</p>}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-blue-800 text-[13px] leading-6">
                טיפ: בפרויקט הדמו אנחנו לא יוצרים קישור אוטומטית דרך Google API. הצוות יוצר את הקישור, והמערכת שומרת אותו כך ששני הצדדים ייכנסו לאותה שיחה.
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button onClick={createMeetVideoSession} disabled={sending || !meetLinkInput.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl py-3 text-[14px] font-bold cursor-pointer">
                שמור ושלח ללקוח
              </button>
              <button onClick={() => setIsMeetLinkModalOpen(false)} className="px-5 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold cursor-pointer hover:bg-white">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}


      {summaryModalSession && (
        <div className="fixed inset-0 z-[1000] bg-black/45 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-gray-100">
            <div className="px-6 py-5 flex items-start justify-between gap-4 border-b border-gray-100">
              <div>
                <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 px-3 py-1 rounded-full text-[12px] font-bold mb-3">
                  <FileText className="w-3.5 h-3.5" /> תיק רפואי
                </div>
                <h3 className="text-gray-900 text-[20px] font-bold">סיכום שיחת וידאו לתיק הרפואי</h3>
                <p className="text-gray-500 text-[13px] mt-1">{ownerDisplayName(selectedOwner)} · {petDisplayName(selectedPet)} · Google Meet #{summaryModalSession.session_id}</p>
              </div>
              <button
                onClick={() => {
                  setSummaryModalSession(null);
                  setVideoSummaryErrors({});
                }}
                className="w-10 h-10 rounded-xl hover:bg-gray-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {videoSummaryErrors.conversation && (
                <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px] font-semibold">
                  {videoSummaryErrors.conversation}
                </div>
              )}

              {videoSummaryErrors.pet && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3 text-[13px] font-semibold">
                  {videoSummaryErrors.pet}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-gray-400 text-[11px] font-bold mb-1">לקוח</p>
                  <p className="text-gray-800 text-[13px] font-bold truncate">{ownerDisplayName(selectedOwner)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-gray-400 text-[11px] font-bold mb-1">חיה</p>
                  <p className="text-gray-800 text-[13px] font-bold truncate">{petDisplayName(selectedPet)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-gray-400 text-[11px] font-bold mb-1">נושא השיחה</p>
                  <p className="text-gray-800 text-[13px] font-bold truncate">{selectedConversation?.subject || "שיחת וידאו"}</p>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 text-[13px] font-bold mb-2">סיכום השיחה *</label>
                <textarea
                  value={videoSummary.summary}
                  onChange={(event) => {
                    setVideoSummary((prev) => ({ ...prev, summary: event.target.value }));
                    if (videoSummaryErrors.summary) setVideoSummaryErrors((prev) => ({ ...prev, summary: "" }));
                  }}
                  placeholder="כתוב בקצרה מה עלה בשיחת הווידאו, מה הוסבר ללקוח ומה סוכם."
                  rows={5}
                  className={`w-full border rounded-2xl px-4 py-3 text-[14px] outline-none focus:ring-2 resize-none ${errorClass(videoSummaryErrors, "summary")}`}
                />
                <ErrorText errors={videoSummaryErrors} field="summary" />
              </div>

              <div>
                <label className="block text-gray-700 text-[13px] font-bold mb-2">הנחיות / המלצות שנמסרו</label>
                <textarea
                  value={videoSummary.recommendations}
                  onChange={(event) => setVideoSummary((prev) => ({ ...prev, recommendations: event.target.value }))}
                  placeholder="לדוגמה: המשך מעקב, קביעת ביקורת, הבאת מסמכים, תיאום בדיקה במרפאה."
                  rows={3}
                  className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-none"
                />
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                <label className="flex items-center gap-2 text-gray-800 text-[13px] font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videoSummary.followUpRequired}
                    onChange={(event) => {
                      setVideoSummary((prev) => ({ ...prev, followUpRequired: event.target.checked }));
                      if (!event.target.checked && videoSummaryErrors.followUpNotes) setVideoSummaryErrors((prev) => ({ ...prev, followUpNotes: "" }));
                    }}
                    className="w-4 h-4 accent-blue-700"
                  />
                  נדרש מעקב אחרי השיחה
                </label>
                {videoSummary.followUpRequired && (
                  <div>
                    <textarea
                      value={videoSummary.followUpNotes}
                      onChange={(event) => {
                        setVideoSummary((prev) => ({ ...prev, followUpNotes: event.target.value }));
                        if (videoSummaryErrors.followUpNotes) setVideoSummaryErrors((prev) => ({ ...prev, followUpNotes: "" }));
                      }}
                      placeholder="מה צריך לעשות בהמשך? מי צריך לחזור ללקוח? האם לקבוע ביקורת?"
                      rows={3}
                      className={`w-full border rounded-2xl px-4 py-3 text-[14px] outline-none focus:ring-2 resize-none ${errorClass(videoSummaryErrors, "followUpNotes")}`}
                    />
                    <ErrorText errors={videoSummaryErrors} field="followUpNotes" />
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-blue-800 text-[13px] leading-6">
                השמירה תיצור רשומה חדשה בתוך <b>medical_visits</b> עם סוג רשומה <b>video_consultation</b>. זה לא שולח אבחנה אוטומטית ולא מחליף תיעוד רפואי של וטרינר.
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
              <button
                onClick={saveVideoSummaryToMedicalRecord}
                disabled={savingSummary}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1e40af] hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl py-3 text-[14px] font-bold cursor-pointer"
              >
                {savingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                שמור לתיק הרפואי
              </button>
              <button
                onClick={() => {
                  setSummaryModalSession(null);
                  setVideoSummaryErrors({});
                }}
                className="px-5 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold cursor-pointer hover:bg-white"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {videoModal && (
        <div className="fixed inset-0 z-[1000] bg-black/45 flex items-center justify-center px-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100">
            <div className="px-6 py-5 flex items-start justify-between gap-4 border-b border-gray-100">
              <div>
                <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[12px] font-bold mb-3">
                  <Video className="w-3.5 h-3.5" /> Google Meet
                </div>
                <h3 className="text-gray-900 text-[20px] font-bold">שיחת וידאו עם הלקוח</h3>
                <p className="text-gray-500 text-[13px] mt-1">{ownerDisplayName(selectedOwner)} · {petDisplayName(selectedPet)}</p>
              </div>
              <button onClick={() => setVideoModal(null)} className="w-10 h-10 rounded-xl hover:bg-gray-100 flex items-center justify-center cursor-pointer">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-3xl border border-emerald-100 bg-gradient-to-l from-emerald-50 to-white p-5">
                <p className="text-gray-900 text-[15px] font-bold mb-2">קישור שיחה משותף</p>
                <p className="text-gray-500 text-[13px] leading-6 mb-4">
                  אותו קישור שמור במערכת וזמין גם לצוות וגם לבעל החיה. לחיצה תפתח את Google Meet בכרטיסייה חדשה.
                </p>
                <div dir="ltr" className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-[13px] text-gray-700 break-all">
                  {videoModal.meeting_url || "לא הוזן קישור"}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => void openMeetSession(videoModal)}
                  disabled={!videoModal.meeting_url}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl py-3 text-[14px] font-bold cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" /> הצטרף לשיחת Google Meet
                </button>
                <button onClick={() => openVideoSummaryModal(videoModal)} className="px-6 py-3 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-100 font-bold cursor-pointer">
                  סכם לתיק רפואי
                </button>
                <button onClick={endVideoSession} className="px-6 py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 font-bold cursor-pointer">
                  סמן כשיחה הסתיימה
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DigitalCareCommandCard({
  open,
  waitingStaff,
  unread,
  video,
  onShowWaiting,
  onShowVideo,
  onNewConversation,
}: {
  open: number;
  waitingStaff: number;
  unread: number;
  video: number;
  onShowWaiting: () => void;
  onShowVideo: () => void;
  onNewConversation: () => void;
}) {
  return (
    <div className="md:col-span-2 xl:col-span-1 relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-[#1e40af] via-[#2563eb] to-[#0f766e] p-5 text-white shadow-lg shadow-blue-500/15">
      <div className="absolute -left-12 -top-12 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute left-6 bottom-6 w-16 h-16 rounded-full bg-white/10" />

      <div className="relative z-10 flex flex-col h-full min-h-[128px] justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/20 px-3 py-1 text-[12px] font-bold mb-3">
            <MessageCircle className="w-3.5 h-3.5" /> מרכז עבודה דיגיטלי
          </div>
          <h2 className="text-[20px] font-extrabold leading-tight mb-1">
            מענה לפניות, וידאו ותיעוד במקום אחד
          </h2>
          <p className="text-blue-50/90 text-[13px] leading-6 font-medium max-w-md">
            מתחילים משיחות שממתינות לצוות, ממשיכים לווידאו כשצריך, ובסוף שומרים סיכום לתיק הרפואי.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onShowWaiting}
            className="rounded-2xl bg-white text-[#1e40af] hover:bg-blue-50 px-3.5 py-2 text-[12px] font-extrabold transition-colors cursor-pointer"
          >
            {waitingStaff > 0 ? `${waitingStaff} ממתינות לצוות` : "אין המתנה לצוות"}
          </button>
          <button
            type="button"
            onClick={onShowVideo}
            className="rounded-2xl bg-white/12 hover:bg-white/20 border border-white/20 px-3.5 py-2 text-[12px] font-bold transition-colors cursor-pointer"
          >
            {video > 0 ? `${video} שיחות וידאו פתוחות` : "וידאו"}
          </button>
          <button
            type="button"
            onClick={onNewConversation}
            className="rounded-2xl bg-white/12 hover:bg-white/20 border border-white/20 px-3.5 py-2 text-[12px] font-bold transition-colors cursor-pointer"
          >
            פנייה חדשה
          </button>
        </div>
      </div>

      <div className="absolute left-5 top-5 hidden 2xl:flex items-center gap-2 text-white/80 text-[12px] font-bold">
        <span>{open} פתוחות</span>
        <span className="w-1 h-1 rounded-full bg-white/60" />
        <span>{unread} חדשות</span>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  tone,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  value: number;
  tone: "blue" | "red" | "amber" | "emerald";
  subtitle?: string;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };

  return (
    <div className="bg-white border border-gray-100 rounded-3xl shadow-sm p-5 flex items-center gap-4 min-h-[138px] hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-gray-500 text-[13px] font-semibold">{title}</p>
        <p className="text-gray-900 text-[28px] font-extrabold leading-tight mt-1">{value}</p>
        {subtitle && <p className="text-gray-400 text-[11px] font-semibold mt-1 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-100 px-3 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-500">{icon}</div>
      <div className="min-w-0">
        <p className="text-gray-400 text-[11px] font-semibold">{label}</p>
        <p className="text-gray-700 text-[13px] font-bold truncate">{value}</p>
      </div>
    </div>
  );
}
