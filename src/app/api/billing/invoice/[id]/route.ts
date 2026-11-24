import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import { getOrganizationById } from "@/lib/store";
import { generateInvoicePdfBuffer } from "@/lib/pdf-invoice";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const resolvedParams = await Promise.resolve(context.params);
  const invoiceId = resolvedParams.id;
  const orgId = rbac.organizationId;

  const db = await connectToDatabase();
  let org: any = getOrganizationById(orgId);
  if (db) {
    const dbOrg = mongoose.Types.ObjectId.isValid(orgId)
      ? await Organization.findById(orgId).lean()
      : await Organization.findOne({ $or: [{ _id: orgId }, { slug: orgId }] }).lean();
    if (dbOrg) org = { ...dbOrg, _id: String((dbOrg as any)._id) };
  }

  const invoices: any[] = Array.isArray(org?.billing?.invoices)
    ? org.billing.invoices
    : [];
  const invoice = invoices.find(
    (inv) => String(inv.id) === String(invoiceId) || String(inv.invoiceNumber) === String(invoiceId)
  ) || {
    id: invoiceId,
    invoiceNumber: invoiceId.startsWith("IC-") ? invoiceId : `IC-${new Date().getFullYear()}-001`,
    periodLabel: new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    amountInr: Number(org?.billing?.unbilledInr || 0),
    minutesBilled: 0,
    status: "paid",
    issuedAt: new Date().toISOString(),
    description: "Voice AI Telephony & Inference Usage",
  };

  const pdfBuffer = generateInvoicePdfBuffer({
    invoiceNumber: invoice.invoiceNumber,
    organizationName: org?.name || rbac.session.workspaceName || "Organization",
    organizationEmail: org?.email || rbac.session.email,
    periodLabel: invoice.periodLabel,
    issuedAt: invoice.issuedAt,
    status: invoice.status,
    description: invoice.description || "Voice AI Usage",
    minutesBilled: Number(invoice.minutesBilled || 0),
    ratePerMinuteInr: Number(!org?.billing?.ratePerMinuteInr || org.billing.ratePerMinuteInr === 3.5 ? 6 : org.billing.ratePerMinuteInr),
    amountInr:
      invoice.type === "usage" && Number(invoice.minutesBilled) > 0
        ? Number(
            (
              Number(invoice.minutesBilled) *
              (!org?.billing?.ratePerMinuteInr || org.billing.ratePerMinuteInr === 3.5
                ? 6
                : org.billing.ratePerMinuteInr)
            ).toFixed(2)
          )
        : Number(invoice.amountInr || 0),
    paymentReference: invoice.paymentReference,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
