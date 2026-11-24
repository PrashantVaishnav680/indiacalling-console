/**
 * Lightweight, zero-dependency PDF 1.4 Invoice Generator (`src/lib/pdf-invoice.ts`).
 * Generates a real, standards-compliant PDF binary buffer with IndiaCalling.ai invoice details,
 * GST breakdown (18%), per-minute rate (₹6.00/min), and payment verification reference.
 */

export interface PdfInvoiceInput {
  invoiceNumber: string;
  organizationName: string;
  organizationEmail?: string;
  periodLabel: string;
  issuedAt: string;
  status: string;
  description: string;
  minutesBilled: number;
  ratePerMinuteInr: number;
  amountInr: number;
  paymentReference?: string;
}

function escapePdfText(str: string): string {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " ");
}

export function generateInvoicePdfBuffer(inv: PdfInvoiceInput): Buffer {
  const subtotal = Number(inv.amountInr || 0);
  const gst = Number((subtotal * 0.18).toFixed(2));
  const grandTotal = Number((subtotal + gst).toFixed(2));
  const issuedDate = new Date(inv.issuedAt || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const lines: Array<{ text: string; size: number; y: number; bold?: boolean }> = [
    { text: "INDIACALLING.AI - TAX INVOICE", size: 18, y: 760, bold: true },
    { text: "Enterprise Voice AI & Multi-Tenant Automation Platform", size: 10, y: 742 },
    { text: "--------------------------------------------------------------------------------", size: 10, y: 724 },
    { text: `Invoice Number : ${inv.invoiceNumber}`, size: 11, y: 702, bold: true },
    { text: `Issue Date     : ${issuedDate}`, size: 11, y: 684 },
    { text: `Billing Period : ${inv.periodLabel}`, size: 11, y: 666 },
    { text: `Payment Status : ${String(inv.status || "PAID").toUpperCase()}`, size: 11, y: 648, bold: true },
    { text: `Billed To      : ${inv.organizationName}`, size: 11, y: 620, bold: true },
    { text: `Account Email  : ${inv.organizationEmail || "N/A"}`, size: 10, y: 604 },
    ...(inv.paymentReference
      ? [{ text: `Payment Ref    : ${inv.paymentReference}`, size: 10, y: 588 }]
      : []),
    { text: "--------------------------------------------------------------------------------", size: 10, y: 562 },
    { text: "LINE ITEM SUMMARY", size: 12, y: 542, bold: true },
    { text: `Description    : ${inv.description}`, size: 10, y: 520 },
    { text: `Minutes Billed : ${inv.minutesBilled} min`, size: 10, y: 502 },
    { text: `Unit Rate      : INR ${inv.ratePerMinuteInr.toFixed(2)} / min`, size: 10, y: 484 },
    { text: "--------------------------------------------------------------------------------", size: 10, y: 458 },
    { text: `Subtotal       : INR ${subtotal.toFixed(2)}`, size: 11, y: 436 },
    { text: `GST (18%)      : INR ${gst.toFixed(2)}`, size: 11, y: 418 },
    { text: `GRAND TOTAL    : INR ${grandTotal.toFixed(2)}`, size: 13, y: 394, bold: true },
    { text: "--------------------------------------------------------------------------------", size: 10, y: 368 },
    { text: "Thank you for using IndiaCalling.ai. This is a system-generated invoice.", size: 9, y: 344 },
  ];

  const streamCommands = lines
    .map((l) => {
      const font = l.bold ? "/F2" : "/F1";
      return `BT ${font} ${l.size} Tf 50 ${l.y} Td (${escapePdfText(l.text)}) Tj ET`;
    })
    .join("\n");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    `6 0 obj\n<< /Length ${Buffer.byteLength(streamCommands, "utf8")} >>\nstream\n${streamCommands}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}
