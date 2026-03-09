import fs from 'fs';
import path from 'path';

interface OCRResult {
  success: boolean;
  senderName: string;
  amount: number;
  date: string;
  cuit: string;
  bankName: string;
  transactionId: string;
  rawText: string;
  confidence: number;
  error?: string;
}

class OCRService {
  private apiKey: string = '';

  configure(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[OCR] OpenAI Vision configurado');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async analyzeComprobante(imagePathOrUrl: string): Promise<OCRResult> {
    if (!this.apiKey) {
      return this.emptyResult('OpenAI API key no configurada');
    }

    try {
      // Read image and convert to base64
      let base64Image: string;
      let mimeType = 'image/jpeg';

      if (imagePathOrUrl.startsWith('/uploads/')) {
        // Local file
        const fullPath = path.join(__dirname, '../../public', imagePathOrUrl);
        if (!fs.existsSync(fullPath)) {
          return this.emptyResult('Imagen no encontrada: ' + imagePathOrUrl);
        }
        const buffer = fs.readFileSync(fullPath);
        base64Image = buffer.toString('base64');

        // Detect mime type from extension
        const ext = path.extname(fullPath).toLowerCase();
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.webp') mimeType = 'image/webp';
      } else if (imagePathOrUrl.startsWith('data:image')) {
        // Already base64 data URI
        const matches = imagePathOrUrl.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!matches) return this.emptyResult('Formato de imagen inválido');
        mimeType = matches[1];
        base64Image = matches[2];
      } else {
        return this.emptyResult('Formato de ruta no soportado');
      }

      console.log(`[OCR] Analizando comprobante: ${imagePathOrUrl.substring(0, 50)}...`);

      // Call OpenAI Vision API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Eres un sistema de OCR especializado en comprobantes de transferencia bancaria argentinos.
Analiza la imagen del comprobante y extrae la siguiente información en formato JSON:

{
  "senderName": "Nombre completo de quien envía la transferencia",
  "amount": 0,
  "date": "DD/MM/YYYY",
  "cuit": "CUIT/CUIL del remitente si es visible",
  "bankName": "Nombre del banco o billetera virtual",
  "transactionId": "Número de operación/referencia si es visible",
  "confidence": 0.95
}

Reglas:
- "amount" debe ser un número sin símbolos ($, ARS, etc). Ej: 5000
- Si no puedes leer un campo, dejalo como string vacío ""
- "confidence" es un número entre 0 y 1 indicando qué tan seguro estás de la lectura
- El nombre del remitente es CRÍTICO - debe ser el nombre de quien ENVÍA, no quien recibe
- El monto es CRÍTICO - debe ser exacto
- Responde SOLO con el JSON, sin explicaciones adicionales`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analizá este comprobante de transferencia y extraé los datos:'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                    detail: 'high',
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[OCR] Error API:', response.status, errorBody);
        return this.emptyResult(`Error API OpenAI: ${response.status}`);
      }

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      console.log('[OCR] Respuesta raw:', content);

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.emptyResult('No se pudo parsear la respuesta de OCR');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const result: OCRResult = {
        success: true,
        senderName: parsed.senderName || '',
        amount: typeof parsed.amount === 'number' ? parsed.amount : parseFloat(parsed.amount) || 0,
        date: parsed.date || '',
        cuit: parsed.cuit || '',
        bankName: parsed.bankName || '',
        transactionId: parsed.transactionId || '',
        rawText: content,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };

      console.log(`[OCR] ✅ Extraído: "${result.senderName}" — $${result.amount} — ${result.date} — Confianza: ${(result.confidence * 100).toFixed(0)}%`);

      return result;
    } catch (err: any) {
      console.error('[OCR] ❌ Error:', err.message);
      return this.emptyResult(err.message);
    }
  }

  private emptyResult(error: string): OCRResult {
    return {
      success: false,
      senderName: '',
      amount: 0,
      date: '',
      cuit: '',
      bankName: '',
      transactionId: '',
      rawText: '',
      confidence: 0,
      error,
    };
  }
}

export const ocrService = new OCRService();
