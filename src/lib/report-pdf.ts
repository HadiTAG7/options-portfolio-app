import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  fundSummary: {
    totalAUM: number;
    totalFundProfit: number;
    totalFeesCollected: number;
  };
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export function generatePartnerReportPDF(data: MonthlyReportData): Buffer {
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
    ["Ownership", `${data.partnerSummary.returnPct >= 0 ? "" : ""}${data.partner.ownershipPct.toFixed(2)}%`],
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

  // Fund Summary
  const autoTableInfo = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable;
  y = (autoTableInfo?.finalY ?? y + 60) + 15;

  doc.setFontSize(14);
  doc.setTextColor(52, 211, 153);
  doc.text("Fund Summary", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Metric", "Value"]],
    body: [
      ["Total AUM", fmt(data.fundSummary.totalAUM)],
      ["Total Fund Profit", fmt(data.fundSummary.totalFundProfit)],
      ["Total Fees Collected", fmt(data.fundSummary.totalFeesCollected)],
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

  return Buffer.from(doc.output("arraybuffer"));
}
