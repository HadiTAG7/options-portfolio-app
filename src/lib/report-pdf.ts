import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PartnerPosition {
  ticker: string;
  type: string; // "Sell Put", "Sell Call", "Stock Sell"
  share: number; // partner's slice of this trade = ownership × total P&L
}

export interface MonthlyReportData {
  periodLabel: string;
  periodKey: string;
  partner: {
    name: string;
    code: string;
    ownershipPct: number;
  };
  partnerSummary: {
    investment: number;
    grossProfit: number;
    feeRatePct: number;
    feeAmount: number;
    netProfit: number;
    returnPct: number;
    currentBalance: number;
  };
  positions: PartnerPosition[];
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

// Builds the jsPDF document itself — safe in BOTH Node (the email API
// route) and the browser (client-side download in the settings panel,
// which needs no server at all).
export function buildPartnerReportDoc(data: MonthlyReportData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  // Header
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, pageWidth, 45, "F");

  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("AlGhanim Options Desk", pageWidth / 2, 18, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(52, 211, 153);
  doc.text(`Monthly Report - ${data.periodKey}`, pageWidth / 2, 28, {
    align: "center",
  });

  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US")}`, pageWidth / 2, 36, {
    align: "center",
  });

  // Partner Info Section
  let y = 55;
  doc.setFontSize(14);
  doc.setTextColor(52, 211, 153);
  doc.text("Partner Information", margin, y);

  y += 10;
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);

  const partnerInfo = [
    ["Code", data.partner.code],
    ["Current Balance", fmt(data.partnerSummary.currentBalance)],
  ];

  for (const [label, value] of partnerInfo) {
    doc.setTextColor(120, 120, 120);
    doc.text(`${label}:`, margin, y);
    doc.setTextColor(30, 30, 30);
    doc.text(value, margin + 50, y);
    y += 7;
  }

  // Performance Table
  y += 8;
  doc.setFontSize(14);
  doc.setTextColor(52, 211, 153);
  doc.text("Monthly Performance", margin, y);
  y += 4;

  const profitPositive = data.partnerSummary.netProfit >= 0;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Item", "Value"]],
    body: [
      ["Investment", fmt(data.partnerSummary.investment)],
      ["Gross Profit", fmt(data.partnerSummary.grossProfit)],
      [`Management Fee (${data.partnerSummary.feeRatePct.toFixed(0)}%)`, fmt(data.partnerSummary.feeAmount)],
      ["Net Profit", fmt(data.partnerSummary.netProfit)],
      ["Return %", `${profitPositive ? "+" : ""}${data.partnerSummary.returnPct.toFixed(2)}%`],
    ],
    theme: "grid",
    headStyles: {
      fillColor: [9, 9, 11],
      textColor: [52, 211, 153],
      fontStyle: "bold",
      fontSize: 11,
    },
    bodyStyles: {
      fontSize: 11,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: "auto", halign: "right" },
    },
  });

  // Your Positions — per-trade share for this partner
  const autoTableInfo = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable;
  y = (autoTableInfo?.finalY ?? y + 60) + 15;

  doc.setFontSize(14);
  doc.setTextColor(52, 211, 153);
  doc.text("Your Positions", margin, y);
  y += 4;

  const sortedPositions = [...data.positions].sort(
    (a, b) => Math.abs(b.share) - Math.abs(a.share)
  );

  const positionRows = sortedPositions.length
    ? sortedPositions.map((p) => [p.ticker, p.type, fmt(p.share)])
    : [["—", "No positions this month", "—"]];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Ticker", "Type", "Your Share"]],
    body: positionRows,
    foot: sortedPositions.length
      ? [
          [
            "",
            "Total",
            fmt(sortedPositions.reduce((s, p) => s + p.share, 0)),
          ],
        ]
      : undefined,
    theme: "grid",
    headStyles: {
      fillColor: [9, 9, 11],
      textColor: [52, 211, 153],
      fontStyle: "bold",
      fontSize: 11,
    },
    bodyStyles: {
      fontSize: 10,
      textColor: [30, 30, 30],
    },
    footStyles: {
      fillColor: [240, 253, 244],
      textColor: [22, 101, 52],
      fontStyle: "bold",
      fontSize: 11,
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: 50 },
      2: { cellWidth: "auto", halign: "right", fontStyle: "bold" },
    },
  });

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(
    "This report is confidential and intended for the named partner only.",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  return doc;
}

// Server-side wrapper — nodemailer attachments need a Node Buffer.
export function generatePartnerReportPDF(data: MonthlyReportData): Buffer {
  return Buffer.from(buildPartnerReportDoc(data).output("arraybuffer"));
}
