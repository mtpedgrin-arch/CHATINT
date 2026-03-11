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

// Lazy import to avoid circular dependency — dataService may not be ready at import time
let _getApiKey: (() => string) | null = null;

class OCRService {
  private apiKey: string = '';

  configure(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[OCR] OpenAI Vision configurado');
  }

  /** Register a function that can dynamically fetch the API key from store */
  setKeyResolver(resolver: () => string) {
    _getApiKey = resolver;
  }

  /** Get the active API key — checks stored key, then dynamic resolver, then env */
  private getActiveKey(): string {
    if (this.apiKey) return this.apiKey;
    // Try dynamic resolver (reads from store.json live)
    if (_getApiKey) {
      const key = _getApiKey();
      if (key) {
        this.apiKey = key;
        console.log('[OCR] API key loaded dynamically from store');
        return key;
      }
    }
    // Fallback to env
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey) {
      this.apiKey = envKey;
      console.log('[OCR] API key loaded from environment variable');
      return envKey;
    }
    return '';
  }

  isConfigured(): boolean {
    return !!this.getActiveKey();
  }

  /**
   * Analyze a comprobante image.
   * Accepts: file path (/uploads/...), data URI (data:image/...), or raw base64 string with mimeType.
   */
  async analyzeComprobante(imagePathOrUrl: string, rawBase64?: string, rawMimeType?: string): Promise<OCRResult> {
    const apiKey = this.getActiveKey();
    if (!apiKey) {
      return this.emptyResult('OpenAI API key no configurada');
    }

    try {
      let base64Image: string;
      let mimeType = 'image/jpeg';

      if (rawBase64) {
        // Direct base64 data passed — skip file system entirely
        base64Image = rawBase64;
        mimeType = rawMimeType || 'image/jpeg';
        console.log(`[OCR] Usando imagen base64 directa (${(rawBase64.length / 1024).toFixed(0)}KB)`);
      } else if (imagePathOrUrl.startsWith('/uploads/')) {
        // Local file — try multiple base paths for compatibility across environments
        const possiblePaths = [
          path.join(__dirname, '../../public', imagePathOrUrl),
          path.join(process.cwd(), 'public', imagePathOrUrl),
        ];
        let fullPath = '';
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            fullPath = p;
            break;
          }
        }
        if (!fullPath) {
          console.error(`[OCR] Imagen no encontrada en ninguna ruta:`, possiblePaths);
          return this.emptyResult('Imagen no encontrada: ' + imagePathOrUrl);
        }
        const buffer = fs.readFileSync(fullPath);
        base64Image = buffer.toString('base64');
        console.log(`[OCR] Imagen leída desde: ${fullPath} (${(buffer.length / 1024).toFixed(0)}KB)`);

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
        return this.emptyResult('Formato de ruta no soportado: ' + imagePathOrUrl.substring(0, 30));
      }

      console.log(`[OCR] Analizando comprobante con OpenAI Vision (model: gpt-4o-mini, mime: ${mimeType})...`);

      // Call OpenAI Vision API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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
        console.error('[OCR] Error API:', response.status, errorBody.substring(0, 200));
        return this.emptyResult(`Error API OpenAI: ${response.status}`);
      }

      const data: any = await response.json();

      // Check for OpenAI error response (can return 200 with error object)
      if (data.error) {
        console.error('[OCR] OpenAI error response:', data.error.message || JSON.stringify(data.error));
        return this.emptyResult(`OpenAI Error: ${data.error.message || 'Unknown error'}`);
      }

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
