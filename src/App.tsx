import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Share2,
  FileText,
  Calendar as CalendarIcon,
  Download,
  CalendarDays,
  FileSpreadsheet,
  Printer,
  Mail,
  Link as LinkIcon,
  X,
  Check,
  Loader2,
  LayoutGrid,
  List,
  Bell,
} from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { toPng } from "html-to-image";

// Custom Floppy Disk Logo SVG based on user image
const FloppyLogo = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 100 100"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 18 C12 12 17 7 23 7 L65 7 L88 30 L88 82 C88 88 83 93 77 93 L23 93 C17 93 12 88 12 82 Z"
      fill="#050505"
      stroke="#f8fafc"
      strokeWidth="6"
      strokeLinejoin="round"
    />
    <path
      d="M26 7 L60 7 L60 33 C60 35 58 37 56 37 L30 37 C28 37 26 35 26 33 Z"
      fill="#4a7df2"
    />
    <rect x="50" y="14" width="6" height="14" rx="2" fill="#050505" />
    <rect x="25" y="52" width="50" height="34" rx="4" fill="#6dbdf6" />
    <rect x="30" y="58" width="40" height="4" rx="2" fill="#050505" />
    <rect x="30" y="67" width="40" height="4" rx="2" fill="#050505" />
    <rect x="30" y="76" width="22" height="4" rx="2" fill="#050505" />
  </svg>
);

// Define the 8-day cycle pattern to match the visual complexity
// We'll use a derived pattern setup that gives a realistic staggered look.
// Cycle: 5 work days, 3 rest days.
const CYCLE_PATTERN = [
  "work",
  "work",
  "work",
  "work",
  "work",
  "rest",
  "rest",
  "rest",
];

type DayState = "work" | "rest" | "training" | "holiday" | "sick" | "none";

interface CustomDayRecord {
  state: DayState;
  note: string;
  reminder?: {
    enabled: boolean;
    type: "in-app" | "email";
    time: string;
  };
}
type CustomOverrides = Record<string, CustomDayRecord>;

interface LegendItem {
  id: DayState;
  label: string;
  dotClass: string;
}

const LEGEND: LegendItem[] = [
  { id: "rest", label: "Repos", dotClass: "bg-[#10a37f]" },
  { id: "work", label: "Travail", dotClass: "bg-[#fbbf24]" },
  { id: "training", label: "Formation", dotClass: "bg-[#E1712B]" },
  { id: "holiday", label: "Congés", dotClass: "bg-[#7F22FE]" },
  {
    id: "sick",
    label: "Maladie",
    dotClass: "bg-white border-2 border-gray-300",
  },
  {
    id: "none",
    label: "Aujourd'hui",
    dotClass: "bg-white border-2 border-red-500",
  },
];

const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const CYCLE_BASE_DATE = new Date(2026, 4, 6); // Base date for cycle to start exactly with 5 working days from May 6

const getDateKey = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function App() {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  type ViewMode = "annual" | "month";
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const year = viewDate.getFullYear();

  const [overrides, setOverrides] = useState<CustomOverrides>({});

  // Day Modal State
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editState, setEditState] = useState<DayState>("work");
  const [editNote, setEditNote] = useState<string>("");
  const [editReminderEnabled, setEditReminderEnabled] = useState(false);
  const [editReminderType, setEditReminderType] = useState<"in-app" | "email">(
    "in-app",
  );
  const [editReminderTime, setEditReminderTime] = useState("09:00");

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // PDF State
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfViewType, setPdfViewType] = useState<"condensed" | "detailed">(
    "condensed",
  );
  const [pdfSelectedMonth, setPdfSelectedMonth] = useState<number>(
    new Date().getMonth(),
  );

  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [triggeredReminders, setTriggeredReminders] = useState<Set<string>>(
    new Set(),
  );
  const [activeToast, setActiveToast] = useState<{
    id: string;
    title: string;
    subtitle: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const key = getDateKey(currentTime);
    const dayData = overrides[key];

    if (dayData?.reminder?.enabled) {
      const currentHour = String(currentTime.getHours()).padStart(2, "0");
      const currentMin = String(currentTime.getMinutes()).padStart(2, "0");
      const timeStr = `${currentHour}:${currentMin}`;

      if (dayData.reminder.time === timeStr) {
        const reminderId = `${key}-${timeStr}`;
        if (!triggeredReminders.has(reminderId)) {
          setActiveToast({
            id: reminderId,
            title: `Rappel pour aujourd'hui`,
            subtitle: dayData.note || "Il y a un événement prévu aujourd'hui.",
            type: dayData.reminder.type,
          });
          setTriggeredReminders((prev) => new Set(prev).add(reminderId));

          // Auto clear toast after 8 seconds
          setTimeout(() => {
            setActiveToast((current) =>
              current?.id === reminderId ? null : current,
            );
          }, 8000);
        }
      }
    }
  }, [currentTime, overrides, triggeredReminders]);

  useEffect(() => {
    // Decoding State from URL if present
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        const decoded = decodeURIComponent(atob(hash));
        const data = JSON.parse(decoded);
        if (data.year) setViewDate(new Date(data.year, 0, 1));
        if (data.overrides) setOverrides(data.overrides);
      } catch (e) {
        console.error("Invalid share link", e);
      }
    }
  }, []);

  const handlePrev = () => {
    const newDate = new Date(viewDate);
    if (viewMode === "annual") newDate.setFullYear(newDate.getFullYear() - 1);
    else if (viewMode === "month") newDate.setMonth(newDate.getMonth() - 1);
    setViewDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(viewDate);
    if (viewMode === "annual") newDate.setFullYear(newDate.getFullYear() + 1);
    else if (viewMode === "month") newDate.setMonth(newDate.getMonth() + 1);
    setViewDate(newDate);
  };

  const handleToday = () => {
    setViewDate(new Date());
  };

  const getHeaderText = () => {
    if (viewMode === "annual") return year.toString();
    if (viewMode === "month") {
      const text = new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }).format(viewDate);
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    return "";
  };

  const getDayState = (date: Date): DayState => {
    const key = getDateKey(date);
    if (overrides[key]) {
      return overrides[key].state;
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    // Calculate difference using UTC to avoid daylight saving issues
    const utcDate = Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const utcBase = Date.UTC(
      CYCLE_BASE_DATE.getFullYear(),
      CYCLE_BASE_DATE.getMonth(),
      CYCLE_BASE_DATE.getDate(),
    );
    const diffDays = Math.floor((utcDate - utcBase) / msPerDay);

    const offset = 0;
    const index =
      (((diffDays + offset) % CYCLE_PATTERN.length) + CYCLE_PATTERN.length) %
      CYCLE_PATTERN.length;

    return CYCLE_PATTERN[index] as DayState;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const handleExportExcel = () => {
    const data = [];
    const firstDay = new Date(year, 0, 1);
    const lastDay = new Date(year, 11, 31);

    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      const stateId = getDayState(d);
      const stateLabel = LEGEND.find((l) => l.id === stateId)?.label || "";
      const key = getDateKey(d);
      const note = overrides[key]?.note || "";

      data.push({
        Date: new Intl.DateTimeFormat("fr-FR").format(d),
        Jour: WEEKDAYS[d.getDay() === 0 ? 6 : d.getDay() - 1],
        Statut: stateLabel,
        Note: note,
      });
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Planning");
    XLSX.writeFile(wb, `Planning-${year}.xlsx`);
  };

  const generatePDF = async (action: "download" | "print" = "download") => {
    setIsPdfModalOpen(false);
    setIsShareModalOpen(false);
    setIsGeneratingPDF(true);
    // Small delay to let the UI render the loading spinner before the main thread is blocked
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const typeToRender = action === "print" ? "condensed" : pdfViewType;

      let pdf: jsPDF;
      if (typeToRender === "condensed") {
        pdf = new jsPDF("p", "mm", "a4");
        const docWidth = pdf.internal.pageSize.getWidth();

        const element = document.getElementById("pdf-condensed-page");
        if (element) {
          const imgData = await toPng(element, {
            pixelRatio: 2,
            backgroundColor: "#ffffff",
          });
          const imgProps = pdf.getImageProperties(imgData);
          const pdfHeight = (imgProps.height * docWidth) / imgProps.width;
          pdf.addImage(imgData, "PNG", 0, 0, docWidth, pdfHeight);
        }
      } else {
        pdf = new jsPDF("p", "mm", "a4");
        const docWidth = pdf.internal.pageSize.getWidth();

        const element = document.getElementById(
          `pdf-detailed-page-${pdfSelectedMonth}`,
        );
        if (element) {
          const imgData = await toPng(element, {
            pixelRatio: 2,
            backgroundColor: "#ffffff",
          });
          const imgProps = pdf.getImageProperties(imgData);
          const pdfHeight = (imgProps.height * docWidth) / imgProps.width;

          pdf.addImage(imgData, "PNG", 0, 0, docWidth, pdfHeight);
        }
      }

      if (action === "print") {
        pdf.autoPrint();
        const blob = pdf.output("bloburl");
        window.open(blob, "_blank");
      } else {
        const filename =
          typeToRender === "condensed"
            ? `PlanMaster-${year}-Condense.pdf`
            : `PlanMaster-${year}-${MONTHS[pdfSelectedMonth]}.pdf`;
        pdf.save(filename);
      }
    } catch (error) {
      console.error(error);
      alert("Erreur lors de la génération du PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getShareLink = () => {
    const data = JSON.stringify({ year, overrides });
    const encoded = btoa(encodeURIComponent(data));
    return `${window.location.origin}${window.location.pathname}#${encoded}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareLink());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`PlanMaster ${year}`);
    const body = encodeURIComponent(
      `Découvrez mon planning ici: ${getShareLink()}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const openEditModal = (date: Date) => {
    const key = getDateKey(date);
    const existing = overrides[key];
    setSelectedDate(date);
    setEditState(existing?.state || getDayState(date));
    setEditNote(existing?.note || "");
    setEditReminderEnabled(existing?.reminder?.enabled || false);
    setEditReminderType(existing?.reminder?.type || "in-app");
    setEditReminderTime(existing?.reminder?.time || "09:00");
  };

  const renderMonth = (
    monthIndex: number,
    isLarge: boolean = false,
    pdfMode: boolean = false,
  ) => {
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Adjust so week starts on Monday (1)
    let startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const days = [];
    const emptyCellClass = isLarge
      ? "mx-auto w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12"
      : "mx-auto w-7 h-7 md:w-8 md:h-8";

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className={emptyCellClass}></div>);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(year, monthIndex, d);
      const state = getDayState(currentDate);
      const today = isToday(currentDate);
      const key = getDateKey(currentDate);
      const hasNote = !!overrides[key]?.note;
      const hasReminder = overrides[key]?.reminder?.enabled;

      let baseClasses = `mx-auto flex items-center justify-center rounded-full font-medium transition-colors relative cursor-pointer group-hover:opacity-80 ${isLarge ? "w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-sm sm:text-base md:text-lg" : "w-7 h-7 md:w-8 md:h-8 text-[11px] md:text-sm"}`;
      let stateClasses = "";

      if (state === "work") {
        stateClasses = "bg-[#fde047] text-slate-800"; // Amber-like yellow
      } else if (state === "rest") {
        stateClasses = "bg-[#10a37f] text-white"; // Green
      } else if (state === "training") {
        stateClasses = "bg-[#E1712B] text-white"; // Orange
      } else if (state === "holiday") {
        stateClasses = "bg-[#7F22FE] text-white"; // Purple
      } else if (state === "sick") {
        stateClasses = "bg-white border-2 border-gray-300 text-slate-800"; // Outline white
      }

      if (today && !pdfMode) {
        stateClasses += " ring-2 ring-red-500 ring-offset-1 ring-offset-white";
        if (
          state !== "work" &&
          state !== "rest" &&
          state !== "training" &&
          state !== "holiday"
        ) {
          stateClasses += " border-2 border-red-500";
        }
      }

      days.push(
        <div
          key={d}
          className="flex justify-center items-center relative group"
        >
          <button
            onClick={() => openEditModal(currentDate)}
            className={`${baseClasses} ${stateClasses}`}
          >
            {d}
            {hasNote && (
              <span
                className={`absolute bg-blue-500 rounded-full border-2 border-white ${isLarge ? "-top-1 -right-1 w-3 h-3" : "-top-1 -right-1 w-2.5 h-2.5"}`}
              ></span>
            )}
            {hasReminder && (
              <span
                className={`absolute bg-rose-500 rounded-full border-2 border-white ${isLarge ? "-bottom-0 -right-1 w-3 h-3" : "-bottom-0.5 -right-0.5 w-2.5 h-2.5"}`}
              ></span>
            )}
          </button>
          {(hasNote || hasReminder) && !pdfMode && (
            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity top-10 z-[60] w-max max-w-[200px] bg-slate-800 text-white text-xs rounded-lg p-3 shadow-lg pointer-events-none flex flex-col gap-1">
              {hasReminder && (
                <div className="text-rose-300 font-bold flex items-center gap-1.5">
                  <Bell className="w-3 h-3" />
                  Rappel: {overrides[key]?.reminder?.time}
                </div>
              )}
              {hasNote && <div>{overrides[key]?.note}</div>}
            </div>
          )}
        </div>,
      );
    }

    const id = pdfMode ? `pdf-month-${monthIndex}` : `month-${monthIndex}`;
    return (
      <div
        id={id}
        key={monthIndex}
        className={`bg-white rounded-2xl ${isLarge ? "p-4 sm:p-6 md:p-8" : "p-5"} shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-100/50 flex flex-col w-full`}
      >
        <h3
          className={`text-center font-semibold text-slate-800 ${isLarge ? "text-xl md:text-2xl mb-6" : "mb-4"}`}
        >
          {MONTHS[monthIndex]}
        </h3>
        <div
          className={`grid grid-cols-7 ${isLarge ? "gap-y-3 gap-x-1 md:gap-y-4 md:gap-x-2" : "gap-y-2 gap-x-1"}`}
        >
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className={`text-center font-medium text-slate-400 mb-2 ${isLarge ? "text-xs md:text-sm" : "text-[11px]"}`}
            >
              {day}
            </div>
          ))}
          {days}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans pb-12 flex flex-col items-center">
      {/* Top Header */}
      <header className="w-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.02)] border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center shrink-0 drop-shadow-sm hover:scale-105 transition-transform cursor-pointer">
              <FloppyLogo className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                PlanMaster
              </h1>
              <p className="text-sm font-medium text-slate-500">
                {currentTime
                  .toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                  .replace(/\//g, ".")}
              </p>
            </div>
          </div>
          <div className="flex items-center bg-slate-50 border border-slate-200 shadow-sm rounded-xl px-4 py-2 text-slate-700 font-bold text-lg tracking-tight">
            {currentTime.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1400px] px-3 md:px-6 mt-4 md:mt-8 flex flex-col gap-4 md:gap-6">
        {/* Toolbar */}
        <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 md:gap-4 flex-wrap w-full lg:w-auto justify-center lg:justify-start">
            <div className="flex items-center bg-[#f8fafc] rounded-xl border border-slate-200 p-1 flex-1 sm:flex-none justify-between sm:justify-start">
              <button
                onClick={handlePrev}
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-2 md:px-6 font-bold text-base md:text-lg text-slate-800 tracking-tight min-w-[100px] md:min-w-[120px] text-center">
                {getHeaderText()}
              </span>
              <button
                onClick={handleNext}
                className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex bg-[#f8fafc] p-1 rounded-xl border border-slate-200 hide-scrollbar overflow-x-auto">
              {(
                [
                  ["month", "Mois"],
                  ["annual", "Année"],
                ] as [ViewMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${viewMode === mode ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={handleToday}
              className="hidden lg:flex items-center gap-2 px-5 py-2.5 bg-[#e2e8f0] hover:bg-[#cbd5e1] text-slate-700 font-semibold rounded-xl transition-colors shrink-0"
            >
              <CalendarIcon className="w-5 h-5" />
              Aujourd'hui
            </button>
          </div>

          <div className="flex gap-2 sm:gap-3 w-full lg:w-auto flex-wrap justify-center">
            <button
              onClick={handleToday}
              className="flex lg:hidden items-center gap-2 px-3 sm:px-4 py-2.5 bg-[#e2e8f0] hover:bg-[#cbd5e1] text-slate-700 font-semibold rounded-xl transition-colors flex-1 sm:flex-none justify-center whitespace-nowrap text-sm"
            >
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              Aujourd'hui
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-[#e2e8f0] hover:bg-[#cbd5e1] text-slate-700 font-semibold rounded-xl transition-colors flex-1 sm:flex-none justify-center whitespace-nowrap text-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button
              onClick={() => setIsPdfModalOpen(true)}
              disabled={isGeneratingPDF}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-[#e2e8f0] hover:bg-[#cbd5e1] text-slate-700 font-semibold rounded-xl transition-colors disabled:opacity-70 flex-1 sm:flex-none justify-center whitespace-nowrap text-sm min-w-[100px]"
            >
              {isGeneratingPDF ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#10a37f]" />
                  Création
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  PDF
                </>
              )}
            </button>
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-[#10a37f] hover:bg-[#0c8c6c] text-white font-medium rounded-xl transition-all shadow-sm shadow-[#10a37f]/20 active:scale-95 flex-[2] sm:flex-none justify-center whitespace-nowrap text-sm"
            >
              <Share2 className="w-4 h-4" />
              Partager
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white px-4 md:px-6 py-4 rounded-xl md:rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex items-center justify-start flex-wrap gap-y-3 gap-x-4">
          <button
            onClick={() => setIsLegendExpanded(!isLegendExpanded)}
            className="flex items-center gap-2 font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 md:px-4 py-1.5 md:py-2 rounded-xl transition-colors border border-slate-200 shrink-0"
          >
            Légende
            <ChevronRight
              className={`w-4 h-4 transition-transform duration-300 ${isLegendExpanded ? "rotate-90 md:rotate-180" : ""}`}
            />
          </button>

          <div
            className={`flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-6 overflow-hidden transition-all duration-500 ease-in-out shrink-0 ${isLegendExpanded ? "md:max-w-[1000px] max-w-full max-h-[500px] md:max-h-20 opacity-100" : "max-w-0 max-h-0 opacity-0"}`}
          >
            {LEGEND.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <div
                  className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded-full ${item.dotClass}`}
                ></div>
                <span className="text-xs md:text-sm font-medium text-slate-500">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-grow flex justify-center items-center text-xs text-slate-400 w-full md:w-auto">
            Astuce : Cliquez sur un jour pour modifier son statut
          </div>
        </div>

        {/* Hidden Container for PDF export of Full Year */}
        <div className="absolute top-[-9999px] left-[-9999px] overflow-hidden -z-50 pointer-events-none">
          {/* Condensed View : 1 A4 Page */}
          <div
            id="pdf-condensed-page"
            className="bg-white w-[794px] h-[1123px] p-8 flex flex-col font-sans"
          >
            <div className="flex justify-between items-end mb-6 pb-4 border-b-2 border-slate-100">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 leading-tight">
                  PlanMaster {year}
                </h1>
                <p className="text-slate-500 font-medium mt-1">Vue Annuelle</p>
              </div>
              <div className="text-sm font-medium text-slate-400">
                Généré le {new Date().toLocaleDateString("fr-FR")}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-6 flex-1">
              {MONTHS.map((monthName, index) => (
                <div key={index} className="flex flex-col">
                  <h3 className="text-center font-bold text-slate-700 py-1.5 mb-2 bg-slate-50 rounded-lg text-sm">
                    {monthName}
                  </h3>
                  <div className="grid grid-cols-7 gap-y-1 gap-x-1">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="text-center font-semibold text-[10px] text-slate-400 mb-1"
                      >
                        {day.charAt(0)}
                      </div>
                    ))}

                    {(() => {
                      const firstDay = new Date(year, index, 1);
                      const lastDay = new Date(year, index + 1, 0);
                      const daysInMonth = lastDay.getDate();
                      let startDayOfWeek =
                        firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

                      const days = [];
                      for (let i = 0; i < startDayOfWeek; i++) {
                        days.push(
                          <div key={`empty-${i}`} className="w-6 h-6"></div>,
                        );
                      }

                      for (let d = 1; d <= daysInMonth; d++) {
                        const currentDate = new Date(year, index, d);
                        const state = getDayState(currentDate);
                        const key = getDateKey(currentDate);
                        const hasNote = !!overrides[key]?.note;

                        let bgClass = "bg-transparent text-slate-700";
                        if (state === "work")
                          bgClass = "bg-[#fde047] text-slate-800";
                        else if (state === "rest")
                          bgClass = "bg-[#10a37f] text-white";
                        else if (state === "training")
                          bgClass = "bg-[#E1712B] text-white";
                        else if (state === "holiday")
                          bgClass = "bg-[#7F22FE] text-white";
                        else if (state === "sick")
                          bgClass =
                            "bg-white border border-slate-300 text-slate-800";

                        days.push(
                          <div
                            key={d}
                            className={`w-6 h-6 mx-auto flex items-center justify-center rounded-full text-[10px] font-bold ${bgClass} relative`}
                          >
                            {d}
                            {hasNote && (
                              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-white"></span>
                            )}
                          </div>,
                        );
                      }
                      return days;
                    })()}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-center gap-6 flex-wrap">
              {LEGEND.filter((l) => l.id !== "none" && l.id !== "sick").map(
                (l) => (
                  <div key={l.id} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${l.dotClass}`}></div>
                    <span className="text-xs font-semibold text-slate-600">
                      {l.label}
                    </span>
                  </div>
                ),
              )}
              <div className="flex items-center gap-2 ml-4">
                <div className="w-3 h-3 rounded-full bg-blue-500 border border-white"></div>
                <span className="text-xs font-semibold text-slate-600">
                  Note
                </span>
              </div>
            </div>
          </div>

          {/* Detailed View : 12 A4 Pages */}
          <div id="pdf-detailed-pages" className="flex flex-col gap-10">
            {MONTHS.map((monthName, index) => (
              <div
                key={index}
                id={`pdf-detailed-page-${index}`}
                className="bg-white w-[794px] h-[1123px] p-12 flex flex-col font-sans"
              >
                <div className="flex justify-between items-end mb-8 pb-6 border-b-2 border-slate-100">
                  <div>
                    <h1 className="text-4xl font-bold text-slate-900 leading-tight">
                      PlanMaster {year}
                    </h1>
                    <p className="text-2xl text-[#10a37f] font-bold mt-2">
                      {monthName}
                    </p>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-xl shadow-sm border border-slate-100">
                    {LEGEND.filter((l) => l.id !== "none" && l.id !== "sick")
                      .reduce((result: any[], value, i, array) => {
                        if (i % 2 === 0) result.push(array.slice(i, i + 2));
                        return result;
                      }, [])
                      .map((pair, pIdx) => (
                        <div key={pIdx} className="flex gap-4">
                          {pair.map((l: any) => (
                            <div
                              key={l.id}
                              className="flex items-center gap-2 w-24"
                            >
                              <div
                                className={`w-4 h-4 rounded-full ${l.dotClass}`}
                              ></div>
                              <span className="text-xs font-bold text-slate-600">
                                {l.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Big Month Grid */}
                <div className="flex-none mb-10">
                  <div className="grid grid-cols-7 gap-y-4 gap-x-2">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="text-center font-bold text-sm text-slate-400 mb-2 uppercase tracking-wide"
                      >
                        {day}
                      </div>
                    ))}
                    {(() => {
                      const firstDay = new Date(year, index, 1);
                      const lastDay = new Date(year, index + 1, 0);
                      const daysInMonth = lastDay.getDate();
                      let startDayOfWeek =
                        firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

                      const days = [];
                      for (let i = 0; i < startDayOfWeek; i++) {
                        days.push(
                          <div key={`empty-${i}`} className="w-16 h-16"></div>,
                        );
                      }

                      for (let d = 1; d <= daysInMonth; d++) {
                        const currentDate = new Date(year, index, d);
                        const state = getDayState(currentDate);
                        const key = getDateKey(currentDate);
                        const hasNote = !!overrides[key]?.note;
                        const hasReminder = !!overrides[key]?.reminder?.enabled;

                        let bgClass = "bg-[#f8fafc] text-slate-700";
                        if (state === "work")
                          bgClass = "bg-[#fde047] text-slate-800 shadow-sm";
                        else if (state === "rest")
                          bgClass = "bg-[#10a37f] text-white shadow-sm";
                        else if (state === "training")
                          bgClass = "bg-[#E1712B] text-white shadow-sm";
                        else if (state === "holiday")
                          bgClass = "bg-[#7F22FE] text-white shadow-sm";
                        else if (state === "sick")
                          bgClass =
                            "bg-white border-2 border-slate-300 text-slate-800";

                        days.push(
                          <div key={d} className="flex justify-center">
                            <div
                              className={`w-16 h-16 flex items-center justify-center rounded-2xl text-xl font-bold ${bgClass} relative`}
                            >
                              {d}
                              {hasNote && (
                                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm"></span>
                              )}
                              {hasReminder && (
                                <span className="absolute -bottom-1 -right-1.5 w-4 h-4 bg-rose-500 rounded-full border-2 border-white shadow-sm"></span>
                              )}
                            </div>
                          </div>,
                        );
                      }
                      return days;
                    })()}
                  </div>
                </div>

                {/* Notes section */}
                <div className="flex-1 bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Événements & Notes
                  </h3>
                  <div className="flex-1 flex flex-col flex-wrap gap-x-8 gap-y-3 max-h-[400px]">
                    {(() => {
                      const lastDay = new Date(year, index + 1, 0);
                      const notesList = [];
                      for (let d = 1; d <= lastDay.getDate(); d++) {
                        const date = new Date(year, index, d);
                        const key = getDateKey(date);
                        const stateId = getDayState(date);
                        const stateLabel =
                          LEGEND.find((l) => l.id === stateId)?.label || "";
                        const note = overrides[key]?.note || "";

                        if (
                          note ||
                          overrides[key]?.reminder?.enabled ||
                          (stateId !== "work" &&
                            stateId !== "rest" &&
                            stateId !== "none" &&
                            stateId !== "sick")
                        ) {
                          const dateStr = new Intl.DateTimeFormat("fr-FR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          }).format(date);

                          let color = "#94a3b8";
                          if (stateId === "work") color = "#fde047";
                          if (stateId === "rest") color = "#10a37f";
                          if (stateId === "training") color = "#E1712B";
                          if (stateId === "holiday") color = "#7F22FE";

                          notesList.push(
                            <div
                              key={d}
                              className="flex gap-3 items-start bg-white p-3 rounded-xl shadow-sm border border-slate-100 break-inside-avoid max-w-[320px] w-full"
                              style={{ breakInside: "avoid" }}
                            >
                              <div className="text-sm font-bold text-slate-700 min-w-[70px] pt-0.5">
                                {dateStr}
                              </div>
                              <div>
                                {stateId !== "work" &&
                                  stateId !== "rest" &&
                                  stateId !== "none" &&
                                  stateId !== "sick" && (
                                    <span
                                      className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide text-white mb-1"
                                      style={{ backgroundColor: color }}
                                    >
                                      {stateLabel}
                                    </span>
                                  )}
                                {note && (
                                  <div className="text-sm font-medium text-slate-600 line-clamp-2">
                                    {note}
                                  </div>
                                )}
                                {overrides[key]?.reminder?.enabled && (
                                  <div className="text-xs font-bold text-rose-500 mt-1.5 flex items-center gap-1">
                                    <Bell className="w-3 h-3" />
                                    {overrides[key].reminder?.time}
                                  </div>
                                )}
                              </div>
                            </div>,
                          );
                        }
                      }
                      if (notesList.length === 0) {
                        return (
                          <div className="text-sm text-slate-400 italic">
                            Aucune note ou événement particulier ce mois-ci.
                          </div>
                        );
                      }
                      return notesList;
                    })()}
                  </div>
                </div>

                <div className="mt-6 text-center text-xs font-semibold text-slate-400">
                  © {year} PlanMaster - Tous droits réservés
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* View Grid */}
        <div className="w-full">
          {viewMode === "annual" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {MONTHS.map((_, index) => renderMonth(index))}
            </div>
          )}
          {viewMode === "month" && (
            <div className="max-w-[500px] mx-auto w-full">
              {renderMonth(viewDate.getMonth(), true)}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 text-center text-sm px-4 font-medium text-slate-400">
        © {year} PlanMaster - Tous droits réservés - Création par{" "}
        <a
          href="https://freemastergoo.byethost7.com/?i=2"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#10a37f] hover:underline whitespace-nowrap"
        >
          WebmasterGO
        </a>
      </footer>

      {/* Modals & Overlays */}

      {/* PDF Export Modal */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg">
                Format d'export PDF
              </h3>
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1.5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div
                onClick={() => setPdfViewType("condensed")}
                className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start gap-4 ${pdfViewType === "condensed" ? "border-[#10a37f] bg-[#10a37f]/5" : "border-slate-100 hover:border-slate-200"}`}
              >
                <div
                  className={`p-2 rounded-lg ${pdfViewType === "condensed" ? "bg-[#10a37f] text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">
                    Vue condensée
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    3 mois par page. Idéal pour une vue globale de l'année.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setPdfViewType("detailed")}
                className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col gap-3 ${pdfViewType === "detailed" ? "border-[#10a37f] bg-[#10a37f]/5" : "border-slate-100 hover:border-slate-200"}`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 rounded-lg ${pdfViewType === "detailed" ? "bg-[#10a37f] text-white" : "bg-slate-100 text-slate-500"}`}
                  >
                    <List className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 text-sm">
                      Vue détaillée (1 mois)
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Télécharger un mois spécifique, formaté pour feuille A4.
                    </p>
                  </div>
                </div>
                {pdfViewType === "detailed" && (
                  <div className="pl-[52px]">
                    <select
                      value={pdfSelectedMonth}
                      onChange={(e) =>
                        setPdfSelectedMonth(Number(e.target.value))
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="w-full border-slate-200 rounded-lg shadow-sm focus:border-[#10a37f] focus:ring focus:ring-[#10a37f]/20 py-2 px-3 border text-sm outline-none transition-all bg-white"
                    >
                      {MONTHS.map((month, index) => (
                        <option key={index} value={index}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 rounded-b-2xl border-t border-slate-100">
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="px-4 py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => generatePDF()}
                className="px-5 py-2.5 bg-[#10a37f] hover:bg-[#0c8c6c] text-white font-medium rounded-xl transition-all shadow-sm shadow-[#10a37f]/20 active:scale-95 text-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exporter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {activeToast && (
        <div className="fixed top-6 right-6 z-[100] bg-white rounded-xl shadow-xl shadow-slate-900/10 border border-slate-100 p-4 max-w-sm w-full animate-in slide-in-from-top-4 fade-in duration-300 flex items-start gap-4">
          <div
            className={`p-3 rounded-full shrink-0 ${activeToast.type === "email" ? "bg-blue-100 text-blue-600" : "bg-[#10a37f]/10 text-[#10a37f]"}`}
          >
            <Bell className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="font-bold text-slate-800 text-sm mb-1">
              {activeToast.title}
            </h4>
            <p className="text-slate-600 text-sm">{activeToast.subtitle}</p>
            {activeToast.type === "email" && (
              <p className="text-xs font-semibold text-blue-500 mt-2 uppercase tracking-wider">
                Email envoyé
              </p>
            )}
          </div>
          <button
            onClick={() => setActiveToast(null)}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Share Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg">
                Partager le planning
              </h3>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1.5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button
                onClick={handleEmailShare}
                className="flex items-center gap-4 w-full p-3 hover:bg-slate-50 rounded-xl transition-colors text-left text-slate-700 font-medium"
              >
                <div className="bg-blue-100 text-blue-600 p-2.5 rounded-lg">
                  <Mail className="w-5 h-5" />
                </div>
                Envoyer par email
              </button>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-4 w-full p-3 hover:bg-slate-50 rounded-xl transition-colors text-left text-slate-700 font-medium"
              >
                <div className="bg-green-100 text-green-600 p-2.5 rounded-lg">
                  {copiedLink ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <LinkIcon className="w-5 h-5" />
                  )}
                </div>
                {copiedLink ? "Lien copié !" : "Copier le lien"}
              </button>
              <button
                onClick={() => generatePDF("print")}
                className="flex items-center gap-4 w-full p-3 hover:bg-slate-50 rounded-xl transition-colors text-left text-slate-700 font-medium"
              >
                <div className="bg-purple-100 text-purple-600 p-2.5 rounded-lg">
                  <Printer className="w-5 h-5" />
                </div>
                Imprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Day Modal */}
      {selectedDate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-lg capitalize">
                {new Intl.DateTimeFormat("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(selectedDate)}
              </h3>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-1.5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Statut du jour
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LEGEND.filter((l) => l.id !== "none").map((l) => {
                    const isSelected = editState === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => setEditState(l.id)}
                        className={`flex items-center gap-2 p-2 border rounded-lg transition-all ${
                          isSelected
                            ? "border-[#10a37f] bg-[#10a37f]/5 ring-1 ring-[#10a37f]"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full shrink-0 ${l.dotClass}`}
                        ></div>
                        <span className="text-sm font-medium text-slate-700">
                          {l.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Note (optionnelle)
                </label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Ajouter une particularité..."
                  className="w-full border-slate-200 rounded-xl shadow-sm focus:border-[#10a37f] focus:ring focus:ring-[#10a37f]/20 py-3 px-4 border min-h-[90px] text-sm resize-none outline-none transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editReminderEnabled}
                      onChange={(e) => setEditReminderEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-[#10a37f] focus:ring-[#10a37f]"
                    />
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-slate-500" />
                      Activer un rappel
                    </span>
                  </label>
                </div>

                {editReminderEnabled && (
                  <div className="flex gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Méthode
                      </label>
                      <select
                        value={editReminderType}
                        onChange={(e) =>
                          setEditReminderType(
                            e.target.value as "email" | "in-app",
                          )
                        }
                        className="w-full border-slate-200 rounded-lg shadow-sm focus:border-[#10a37f] focus:ring focus:ring-[#10a37f]/20 py-2 px-3 border text-sm outline-none transition-all bg-white"
                      >
                        <option value="in-app">Alerte in-app</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Heure
                      </label>
                      <input
                        type="time"
                        value={editReminderTime}
                        onChange={(e) => setEditReminderTime(e.target.value)}
                        className="w-full border-slate-200 rounded-lg shadow-sm focus:border-[#10a37f] focus:ring focus:ring-[#10a37f]/20 py-2 px-3 border text-sm outline-none transition-all bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 rounded-b-2xl border-t border-slate-100">
              <button
                onClick={() => setSelectedDate(null)}
                className="px-4 py-2.5 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setOverrides((prev) => ({
                    ...prev,
                    [getDateKey(selectedDate)]: {
                      state: editState,
                      note: editNote,
                      reminder: editReminderEnabled
                        ? {
                            enabled: true,
                            type: editReminderType,
                            time: editReminderTime,
                          }
                        : undefined,
                    },
                  }));
                  setSelectedDate(null);
                }}
                className="px-5 py-2.5 bg-[#10a37f] hover:bg-[#0c8c6c] text-white font-medium rounded-xl transition-all shadow-sm shadow-[#10a37f]/20 active:scale-95 text-sm"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
