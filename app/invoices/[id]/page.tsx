import { notFound } from 'next/navigation';
import InvoiceFormClient from '@/components/InvoiceFormClient';

interface Invoice {
    _id: string;
    invoiceCode: string;
    patient: {
        _id: string;
        firstName: string;
        lastName: string;
        patientCode?: string;
    };
    items: Array<{
        name: string;
        quantity: number;
        price: number;
    }>;
    total: number;
    totalPaid: number;
    outstandingBalance: number;
    status: string;
    createdAt: string;
}

async function getInvoice(id: string): Promise<Invoice | null> {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/invoices/${id}`, {
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.success || !data.data) return null;
        return data.data as Invoice;
    } catch {
        return null;
    }
}

export default async function InvoiceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const invoice = await getInvoice(id);
    if (!invoice) {
        return notFound();
    }

    return (
        <section className="py-12 px-4">
            <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-lg p-6">
                <h1 className="text-2xl font-bold mb-2">Invoice #{invoice.invoiceCode}</h1>
                <div className="mb-4 text-gray-700">
                    <div><span className="font-semibold">Patient:</span> {invoice.patient.firstName} {invoice.patient.lastName} ({invoice.patient.patientCode || invoice.patient._id})</div>
                    <div><span className="font-semibold">Status:</span> {invoice.status}</div>
                    <div><span className="font-semibold">Created:</span> {new Date(invoice.createdAt).toLocaleDateString()}</div>
                </div>
                <table className="w-full mb-4">
                    <thead>
                        <tr className="bg-gray-50">
                            <th className="text-left px-2 py-1">Item</th>
                            <th className="text-right px-2 py-1">Qty</th>
                            <th className="text-right px-2 py-1">Price</th>
                            <th className="text-right px-2 py-1">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="px-2 py-1">{item.name}</td>
                                <td className="px-2 py-1 text-right">{item.quantity}</td>
                                <td className="px-2 py-1 text-right">${item.price.toFixed(2)}</td>
                                <td className="px-2 py-1 text-right">${(item.price * item.quantity).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="flex justify-end gap-6 text-lg font-semibold">
                    <div>Total: ${invoice.total.toFixed(2)}</div>
                    <div>Paid: ${invoice.totalPaid.toFixed(2)}</div>
                    <div>Outstanding: ${invoice.outstandingBalance.toFixed(2)}</div>
                </div>
                {/* Optionally, add InvoiceFormClient for editing */}
                {/* <InvoiceFormClient invoice={invoice} /> */}
            </div>
        </section>
    );
}
