import PDFDocument from "pdfkit";
import { generateQRCodeBuffer } from "./crypto";

export interface TicketPDFData {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  ticketType: string;
  qrCode: string;
  ticketId: string;
}

export async function generateTicketPDF(data: TicketPDFData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A6',
        margin: 20
      });

      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Header
      doc.fontSize(16).text(data.eventName, { align: 'center' });
      doc.moveDown();

      // Event details
      doc.fontSize(12).text(`Fecha: ${data.eventDate}`);
      doc.text(`Ubicación: ${data.eventLocation}`);
      doc.text(`Tipo de Ticket: ${data.ticketType}`);
      doc.moveDown();

      // Attendee info
      doc.fontSize(14).text('Asistente:', { underline: true });
      doc.fontSize(12).text(data.attendeeName);
      doc.text(`ID del Ticket: ${data.ticketId}`);
      doc.moveDown();

      // QR Code
      const qrBuffer = await generateQRCodeBuffer(data.qrCode);
      doc.image(qrBuffer, {
        fit: [150, 150],
        align: 'center'
      });

      doc.moveDown();
      doc.fontSize(10).text('Escanee este código QR para check-in', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}