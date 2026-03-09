import fs from 'fs';
import path from 'path';
import { Client, PushSubscriptionRecord } from './data.service';

// ============================================================================
// Tipos para la configuración de push-automation.json
// ============================================================================

/** Regla de inactividad: define qué notificación enviar según días sin actividad */
interface InactivityRule {
  daysInactive: number;
  title: string;
  body: string;
  icon: string;
  url: string;
  onlyOnce: boolean;
}

/** Campaña programada: se envía en días y horarios específicos */
interface ScheduledCampaign {
  id: string;
  name: string;
  enabled: boolean;
  days: string[];
  time: string;
  title: string;
  body: string;
  icon: string;
  url: string;
  segment: string;
}

/** Trigger de evento: plantilla para notificaciones basadas en eventos */
interface EventTrigger {
  enabled: boolean;
  title: string;
  body: string;
  icon: string;
  url: string;
  minutesBefore?: number;
}

/** Definición de un segmento de usuarios */
interface SegmentDefinition {
  filter: string;
  description: string;
  minDays?: number;
  maxDays?: number;
  minDeposits?: number;
}

/** Plantilla de notificación push reutilizable */
interface PushTemplate {
  id: string;
  name: string;
  category: string;
  title: string;
  body: string;
  icon: string;
  url: string;
}

/** Entrada del log de pushes enviados */
interface PushLogEntry {
  id: string;
  type: string;
  campaignId?: string;
  ruleId?: string;
  triggerType?: string;
  clientId: number | null;
  title: string;
  body: string;
  sentAt: string;
  success: boolean;
}

/** Configuración global del sistema de automatización */
interface GlobalConfig {
  enabled: boolean;
  timezone: string;
  checkIntervalMinutes: number;
  maxPushesPerUserPerDay: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  defaultIcon: string;
  defaultUrl: string;
}

/** Estructura completa del archivo push-automation.json */
interface PushAutomationConfig {
  global: GlobalConfig;
  inactivity: {
    enabled: boolean;
    rules: InactivityRule[];
  };
  scheduled: {
    enabled: boolean;
    campaigns: ScheduledCampaign[];
  };
  events: {
    enabled: boolean;
    triggers: Record<string, EventTrigger>;
  };
  segments: Record<string, SegmentDefinition>;
  templates: PushTemplate[];
  pushLog: PushLogEntry[];
}

/** Resultado de la verificación de inactividad */
interface InactivityResult {
  sent: number;
  skipped: number;
}

/** Resultado de las campañas programadas */
interface ScheduledResult {
  campaignsSent: string[];
}

/** Información de suscriptor con su cliente asociado */
interface SubscriberInfo {
  subscription: PushSubscriptionRecord;
  client: Client;
}

/** Estadísticas de push */
interface PushStats {
  totalToday: number;
  totalThisWeek: number;
  byCampaign: Record<string, number>;
  activeSubscribers: number;
}

/** Datos de un evento para notificaciones */
interface EventData {
  eventId?: string;
  eventName?: string;
  prizeAmount?: number;
  prizeDescription?: string;
  raffleName?: string;
  raffleId?: string;
  [key: string]: any;
}

// ============================================================================
// Tipos de los servicios que se reciben por constructor
// ============================================================================

/** Tipo del DataService (se usa la instancia exportada de data.service.ts) */
type DataService = {
  getClients(): Client[];
  getClientById(id: number): Client | undefined;
  getPushSubscriptions(): PushSubscriptionRecord[];
  getPushSubscriptionsByClient(clientId: number): PushSubscriptionRecord[];
};

/** Tipo del PushService (se usa la instancia exportada de push.service.ts) */
type PushService = {
  sendToSubscription(subscription: any, payload: {
    title: string; body: string; icon?: string; badge?: string; url?: string; vibrate?: number[];
  }): Promise<boolean>;
  sendToMultiple(subscriptions: any[], payload: {
    title: string; body: string; icon?: string; badge?: string; url?: string; vibrate?: number[];
  }): Promise<{ delivered: number; failed: number; expiredEndpoints: string[] }>;
};


// ============================================================================
// Servicio de Automatización de Push Notifications
// ============================================================================

/**
 * PushAutomationService
 *
 * Gestiona campañas automatizadas de notificaciones push para la plataforma
 * de casino. Lee configuración desde push-automation.json y utiliza los
 * servicios existentes de push y datos.
 *
 * Funcionalidades principales:
 * - Notificaciones por inactividad del usuario
 * - Campañas programadas por día/hora
 * - Notificaciones basadas en eventos del casino
 * - Segmentación de usuarios (VIP, activos, inactivos, etc.)
 * - Control de horarios silenciosos y límites diarios
 * - Log completo de todos los envíos
 */
class PushAutomationService {
  /** Configuración cargada desde el archivo JSON */
  private config: PushAutomationConfig;

  /** Handle del intervalo de chequeo periódico */
  private intervalHandle: NodeJS.Timeout | null = null;

  /** Ruta absoluta al archivo de configuración JSON */
  private configPath: string;

  /** Servicio de datos para acceder a clientes y suscripciones */
  private dataService: DataService;

  /** Servicio de push para enviar notificaciones */
  private pushService: PushService;

  /**
   * Constructor del servicio de automatización.
   * Carga la configuración desde el archivo JSON al iniciar.
   *
   * @param dataService - Instancia del servicio de datos
   * @param pushService - Instancia del servicio de push
   */
  constructor(dataService: DataService, pushService: PushService) {
    this.dataService = dataService;
    this.pushService = pushService;
    this.configPath = path.join(__dirname, '../../data/push-automation.json');
    this.config = this.loadConfigFromFile();
  }

  // ==========================================================================
  // Métodos de carga y persistencia de configuración
  // ==========================================================================

  /**
   * Carga la configuración desde el archivo JSON.
   * Si falla, devuelve una configuración mínima por defecto.
   */
  private loadConfigFromFile(): PushAutomationConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as PushAutomationConfig;
      console.log('[PUSH-AUTO] Configuración cargada correctamente');
      return parsed;
    } catch (err) {
      console.error('[PUSH-AUTO] Error al cargar configuración:', err);
      // Devolver configuración mínima para no romper el servicio
      return {
        global: {
          enabled: false,
          timezone: 'America/Argentina/Buenos_Aires',
          checkIntervalMinutes: 15,
          maxPushesPerUserPerDay: 3,
          quietHoursStart: 2,
          quietHoursEnd: 9,
          defaultIcon: '🎰',
          defaultUrl: '/casino',
        },
        inactivity: { enabled: false, rules: [] },
        scheduled: { enabled: false, campaigns: [] },
        events: { enabled: false, triggers: {} },
        segments: {},
        templates: [],
        pushLog: [],
      };
    }
  }

  /**
   * Recarga la configuración desde el archivo JSON.
   * Útil para aplicar cambios sin reiniciar el servidor.
   *
   * @returns La configuración recargada
   */
  reloadConfig(): PushAutomationConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(raw) as PushAutomationConfig;
      console.log('[PUSH-AUTO] Configuración recargada correctamente');
      return this.config;
    } catch (err) {
      console.error('[PUSH-AUTO] Error al recargar configuración:', err);
      return this.config;
    }
  }

  /**
   * Guarda la configuración actual en el archivo JSON con formato legible.
   */
  saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      console.log('[PUSH-AUTO] Configuración guardada correctamente');
    } catch (err) {
      console.error('[PUSH-AUTO] Error al guardar configuración:', err);
    }
  }

  /**
   * Devuelve la configuración actual en memoria.
   *
   * @returns Configuración completa
   */
  getConfig(): PushAutomationConfig {
    return this.config;
  }

  /**
   * Actualiza una sección específica de la configuración.
   * Hace un merge parcial de los datos proporcionados.
   *
   * @param section - Nombre de la sección a actualizar (ej: 'global', 'inactivity')
   * @param data - Datos parciales para hacer merge
   */
  updateConfig(section: keyof PushAutomationConfig, data: any): void {
    try {
      if (typeof this.config[section] === 'object' && !Array.isArray(this.config[section])) {
        // Merge para objetos
        (this.config as any)[section] = { ...(this.config as any)[section], ...data };
      } else {
        // Reemplazo directo para arrays u otros tipos
        (this.config as any)[section] = data;
      }
      this.saveConfig();
      console.log(`[PUSH-AUTO] Sección "${section}" actualizada`);
    } catch (err) {
      console.error(`[PUSH-AUTO] Error al actualizar sección "${section}":`, err);
    }
  }

  // ==========================================================================
  // Control del ciclo de automatización
  // ==========================================================================

  /**
   * Inicia el ciclo de automatización.
   * Configura un intervalo periódico y ejecuta un chequeo inmediato.
   */
  start(): void {
    try {
      // Verificar si la automatización está habilitada
      if (!this.config.global.enabled) {
        console.log('[PUSH-AUTO] Push automation is DISABLED');
        return;
      }

      const intervalMs = this.config.global.checkIntervalMinutes * 60 * 1000;

      // Ejecutar chequeo inicial inmediato
      this.runAutomationCycle();

      // Configurar intervalo periódico
      this.intervalHandle = setInterval(() => {
        this.runAutomationCycle();
      }, intervalMs);

      console.log(
        `[PUSH-AUTO] Push automation started, checking every ${this.config.global.checkIntervalMinutes} minutes`
      );
    } catch (err) {
      console.error('[PUSH-AUTO] Error al iniciar automatización:', err);
    }
  }

  /**
   * Detiene el ciclo de automatización.
   * Limpia el intervalo periódico.
   */
  stop(): void {
    try {
      if (this.intervalHandle) {
        clearInterval(this.intervalHandle);
        this.intervalHandle = null;
        console.log('[PUSH-AUTO] Automatización detenida');
      }
    } catch (err) {
      console.error('[PUSH-AUTO] Error al detener automatización:', err);
    }
  }

  // ==========================================================================
  // Ciclo principal de automatización
  // ==========================================================================

  /**
   * Ejecuta un ciclo completo de automatización.
   * Se llama periódicamente según el intervalo configurado.
   * Verifica horarios silenciosos antes de procesar reglas.
   */
  async runAutomationCycle(): Promise<void> {
    try {
      console.log('[PUSH-AUTO] Ejecutando ciclo de automatización...');

      // Verificar si estamos en horario silencioso
      if (this.isQuietHours()) {
        console.log('[PUSH-AUTO] Horario silencioso activo, ciclo omitido');
        return;
      }

      // Procesar reglas de inactividad
      const inactivityResult = await this.checkInactivity();
      console.log(
        `[PUSH-AUTO] Inactividad: ${inactivityResult.sent} enviados, ${inactivityResult.skipped} omitidos`
      );

      // Procesar campañas programadas
      const scheduledResult = await this.checkScheduledCampaigns();
      console.log(
        `[PUSH-AUTO] Campañas enviadas: ${scheduledResult.campaignsSent.length > 0 ? scheduledResult.campaignsSent.join(', ') : 'ninguna'}`
      );

      console.log('[PUSH-AUTO] Ciclo de automatización completado');
    } catch (err) {
      console.error('[PUSH-AUTO] Error en ciclo de automatización:', err);
    }
  }

  // ==========================================================================
  // Verificaciones de horario y límites
  // ==========================================================================

  /**
   * Verifica si la hora actual está dentro del horario silencioso.
   * Durante el horario silencioso no se envían notificaciones automáticas.
   *
   * @returns true si estamos en horario silencioso
   */
  isQuietHours(): boolean {
    try {
      const now = new Date();
      // Obtener la hora actual en la zona horaria configurada
      const currentHour = parseInt(
        now.toLocaleString('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: this.config.global.timezone,
        })
      );

      const start = this.config.global.quietHoursStart;
      const end = this.config.global.quietHoursEnd;

      // Manejar rangos que cruzan la medianoche (ej: 2 a 9)
      if (start <= end) {
        return currentHour >= start && currentHour < end;
      } else {
        // Rango que cruza medianoche (ej: 22 a 6)
        return currentHour >= start || currentHour < end;
      }
    } catch (err) {
      console.error('[PUSH-AUTO] Error al verificar horario silencioso:', err);
      return false;
    }
  }

  /**
   * Verifica si se puede enviar una notificación más a un usuario hoy.
   * Controla el límite diario de pushes por usuario.
   *
   * @param clientId - ID del cliente a verificar
   * @returns true si el usuario puede recibir más pushes hoy
   */
  canSendToUser(clientId: number): boolean {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Contar pushes enviados hoy a este cliente
      const pushesToday = this.config.pushLog.filter(
        (entry) =>
          entry.clientId === clientId &&
          entry.sentAt.startsWith(today) &&
          entry.success
      ).length;

      return pushesToday < this.config.global.maxPushesPerUserPerDay;
    } catch (err) {
      console.error('[PUSH-AUTO] Error al verificar límite de usuario:', err);
      return false;
    }
  }

  // ==========================================================================
  // Procesamiento de reglas de inactividad
  // ==========================================================================

  /**
   * Procesa las reglas de inactividad.
   * Para cada cliente con suscripción push, verifica cuántos días lleva
   * inactivo y envía la notificación correspondiente según las reglas.
   *
   * @returns Cantidad de notificaciones enviadas y omitidas
   */
  async checkInactivity(): Promise<InactivityResult> {
    const result: InactivityResult = { sent: 0, skipped: 0 };

    try {
      // Verificar si el módulo de inactividad está habilitado
      if (!this.config.inactivity.enabled) {
        console.log('[PUSH-AUTO] Módulo de inactividad deshabilitado');
        return result;
      }

      const clients = this.dataService.getClients();
      const subscriptions = this.dataService.getPushSubscriptions();
      const now = new Date();

      for (const client of clients) {
        try {
          // Obtener suscripciones push del cliente
          const clientSubs = subscriptions.filter((s) => s.clientId === client.id);

          // Si no tiene suscripciones push, omitir
          if (clientSubs.length === 0) {
            continue;
          }

          // Calcular días desde la última actividad
          const lastActivity = new Date(client.lastActivity);
          const diffMs = now.getTime() - lastActivity.getTime();
          const daysSinceLastActivity = Math.floor(diffMs / (1000 * 60 * 60 * 24));

          // Buscar reglas que apliquen (ordenar de mayor a menor para tomar la más relevante)
          const matchingRules = this.config.inactivity.rules
            .filter((rule) => rule.daysInactive <= daysSinceLastActivity)
            .sort((a, b) => b.daysInactive - a.daysInactive);

          if (matchingRules.length === 0) {
            continue;
          }

          // Tomar la regla más específica (la de mayor daysInactive que aplique)
          const bestRule = matchingRules[0];

          // Verificar si ya se envió esta regla a este cliente (para reglas onlyOnce)
          if (bestRule.onlyOnce) {
            const alreadySent = this.config.pushLog.some(
              (entry) =>
                entry.clientId === client.id &&
                entry.type === 'inactivity' &&
                entry.ruleId === `inactivity_${bestRule.daysInactive}` &&
                entry.success
            );

            if (alreadySent) {
              result.skipped++;
              continue;
            }
          }

          // Verificar si ya se envió hoy esta misma regla a este cliente
          const today = new Date().toISOString().split('T')[0];
          const sentToday = this.config.pushLog.some(
            (entry) =>
              entry.clientId === client.id &&
              entry.type === 'inactivity' &&
              entry.ruleId === `inactivity_${bestRule.daysInactive}` &&
              entry.sentAt.startsWith(today) &&
              entry.success
          );

          if (sentToday) {
            result.skipped++;
            continue;
          }

          // Verificar límite diario del usuario
          if (!this.canSendToUser(client.id)) {
            result.skipped++;
            continue;
          }

          // Enviar notificación push a todas las suscripciones del cliente
          const payload = {
            title: bestRule.title,
            body: bestRule.body,
            icon: bestRule.icon || this.config.global.defaultIcon,
            url: bestRule.url || this.config.global.defaultUrl,
          };

          for (const sub of clientSubs) {
            const success = await this.pushService.sendToSubscription(
              { endpoint: sub.endpoint, keys: sub.keys },
              payload
            );

            // Registrar en el log
            this.addToPushLog({
              id: `${Date.now()}_${client.id}_inactivity`,
              type: 'inactivity',
              ruleId: `inactivity_${bestRule.daysInactive}`,
              clientId: client.id,
              title: bestRule.title,
              body: bestRule.body,
              sentAt: new Date().toISOString(),
              success,
            });

            if (success) {
              result.sent++;
            } else {
              result.skipped++;
            }
          }
        } catch (clientErr) {
          console.error(
            `[PUSH-AUTO] Error procesando inactividad para cliente ${client.id}:`,
            clientErr
          );
          result.skipped++;
        }
      }
    } catch (err) {
      console.error('[PUSH-AUTO] Error en checkInactivity:', err);
    }

    return result;
  }

  // ==========================================================================
  // Procesamiento de campañas programadas
  // ==========================================================================

  /**
   * Procesa las campañas programadas.
   * Verifica si hay campañas que deban ejecutarse según el día y hora actuales.
   * Usa una tolerancia de tiempo basada en el intervalo de chequeo.
   *
   * @returns Lista de nombres de campañas que se enviaron
   */
  async checkScheduledCampaigns(): Promise<ScheduledResult> {
    const result: ScheduledResult = { campaignsSent: [] };

    try {
      // Verificar si el módulo de campañas programadas está habilitado
      if (!this.config.scheduled.enabled) {
        console.log('[PUSH-AUTO] Módulo de campañas programadas deshabilitado');
        return result;
      }

      // Obtener día y hora actual en la zona horaria configurada
      const now = new Date();
      const currentDay = this.getDayName();
      const currentTimeStr = now.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: this.config.global.timezone,
      });

      // Convertir hora actual a minutos desde medianoche para comparación
      const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);
      const currentMinutes = currentHour * 60 + currentMinute;
      const today = now.toISOString().split('T')[0];

      // Tolerancia basada en el intervalo de chequeo (para no perder campañas)
      const toleranceMinutes = this.config.global.checkIntervalMinutes;

      for (const campaign of this.config.scheduled.campaigns) {
        try {
          // Verificar si la campaña está habilitada
          if (!campaign.enabled) {
            continue;
          }

          // Verificar si el día actual coincide
          if (!campaign.days.includes(currentDay)) {
            continue;
          }

          // Verificar si la hora actual coincide (con tolerancia)
          const [campaignHour, campaignMinute] = campaign.time.split(':').map(Number);
          const campaignMinutes = campaignHour * 60 + campaignMinute;
          const timeDiff = Math.abs(currentMinutes - campaignMinutes);

          if (timeDiff > toleranceMinutes) {
            continue;
          }

          // Verificar si ya se envió esta campaña hoy
          const alreadySentToday = this.config.pushLog.some(
            (entry) =>
              entry.type === 'scheduled' &&
              entry.campaignId === campaign.id &&
              entry.sentAt.startsWith(today) &&
              entry.success
          );

          if (alreadySentToday) {
            continue;
          }

          // Obtener suscriptores filtrados por segmento
          const subscribers = this.getSubscribersBySegment(campaign.segment);

          if (subscribers.length === 0) {
            console.log(
              `[PUSH-AUTO] Campaña "${campaign.name}": sin suscriptores en segmento "${campaign.segment}"`
            );
            continue;
          }

          // Preparar payload de la notificación
          const payload = {
            title: campaign.title,
            body: campaign.body,
            icon: campaign.icon || this.config.global.defaultIcon,
            url: campaign.url || this.config.global.defaultUrl,
          };

          // Enviar a todos los suscriptores del segmento
          let sentCount = 0;
          for (const { subscription, client } of subscribers) {
            // Verificar límite diario del usuario
            if (!this.canSendToUser(client.id)) {
              continue;
            }

            const success = await this.pushService.sendToSubscription(
              { endpoint: subscription.endpoint, keys: subscription.keys },
              payload
            );

            // Registrar en el log
            this.addToPushLog({
              id: `${Date.now()}_${client.id}_${campaign.id}`,
              type: 'scheduled',
              campaignId: campaign.id,
              clientId: client.id,
              title: campaign.title,
              body: campaign.body,
              sentAt: new Date().toISOString(),
              success,
            });

            if (success) {
              sentCount++;
            }
          }

          console.log(
            `[PUSH-AUTO] Campaña "${campaign.name}" enviada a ${sentCount} suscriptores`
          );
          result.campaignsSent.push(campaign.name);
        } catch (campaignErr) {
          console.error(
            `[PUSH-AUTO] Error procesando campaña "${campaign.name}":`,
            campaignErr
          );
        }
      }
    } catch (err) {
      console.error('[PUSH-AUTO] Error en checkScheduledCampaigns:', err);
    }

    return result;
  }

  // ==========================================================================
  // Segmentación de suscriptores
  // ==========================================================================

  /**
   * Filtra los suscriptores push según un segmento definido en la configuración.
   * Combina datos de suscripciones con datos de clientes para aplicar filtros.
   *
   * @param segmentName - Nombre del segmento (ej: 'all', 'vip', 'active')
   * @returns Array de objetos con la suscripción y su cliente asociado
   */
  getSubscribersBySegment(segmentName: string): SubscriberInfo[] {
    try {
      const subscriptions = this.dataService.getPushSubscriptions();
      const clients = this.dataService.getClients();
      const segment = this.config.segments[segmentName];
      const now = new Date();

      // Primero, obtener solo suscripciones que tienen un clientId asociado
      const subsWithClient: SubscriberInfo[] = [];

      for (const sub of subscriptions) {
        if (sub.clientId === null) {
          continue;
        }
        const client = clients.find((c) => c.id === sub.clientId);
        if (client) {
          subsWithClient.push({ subscription: sub, client });
        }
      }

      // Si no hay definición de segmento, devolver todos
      if (!segment) {
        console.log(`[PUSH-AUTO] Segmento "${segmentName}" no encontrado, usando todos`);
        return subsWithClient;
      }

      // Filtrar según el tipo de segmento
      switch (segment.filter) {
        case 'all':
          // Todos los suscriptores con clientId
          return subsWithClient;

        case 'vip':
          // Solo clientes VIP
          return subsWithClient.filter((s) => s.client.vip === true);

        case 'active':
          // Clientes con actividad reciente (dentro de maxDays)
          return subsWithClient.filter((s) => {
            const lastActivity = new Date(s.client.lastActivity);
            const diffMs = now.getTime() - lastActivity.getTime();
            const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return daysSince <= (segment.maxDays ?? 3);
          });

        case 'inactive':
          // Clientes sin actividad reciente (más de minDays)
          return subsWithClient.filter((s) => {
            const lastActivity = new Date(s.client.lastActivity);
            const diffMs = now.getTime() - lastActivity.getTime();
            const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return daysSince >= (segment.minDays ?? 7);
          });

        case 'new':
          // Clientes registrados recientemente (dentro de maxDays)
          return subsWithClient.filter((s) => {
            const createdAt = new Date(s.client.createdAt);
            const diffMs = now.getTime() - createdAt.getTime();
            const daysSince = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            return daysSince <= (segment.maxDays ?? 7);
          });

        case 'highValue':
          // Clientes con depósitos altos
          return subsWithClient.filter(
            (s) => s.client.totalDepositos >= (segment.minDeposits ?? 50000)
          );

        default:
          console.log(`[PUSH-AUTO] Filtro de segmento desconocido: "${segment.filter}"`);
          return subsWithClient;
      }
    } catch (err) {
      console.error('[PUSH-AUTO] Error al filtrar suscriptores por segmento:', err);
      return [];
    }
  }

  // ==========================================================================
  // Notificaciones basadas en eventos
  // ==========================================================================

  /**
   * Envía notificaciones push relacionadas con eventos del casino.
   * Reemplaza variables de plantilla con los datos reales del evento.
   *
   * @param triggerType - Tipo de trigger (ej: 'onEventStart', 'onEventEnded')
   * @param eventData - Datos del evento para reemplazar en la plantilla
   */
  async sendEventPush(triggerType: string, eventData: EventData): Promise<void> {
    try {
      // Verificar si el módulo de eventos está habilitado
      if (!this.config.events.enabled) {
        console.log('[PUSH-AUTO] Módulo de eventos deshabilitado');
        return;
      }

      // Verificar si el trigger específico existe y está habilitado
      const trigger = this.config.events.triggers[triggerType];
      if (!trigger || !trigger.enabled) {
        console.log(`[PUSH-AUTO] Trigger "${triggerType}" no encontrado o deshabilitado`);
        return;
      }

      // Reemplazar variables de plantilla con datos del evento
      let title = trigger.title;
      let body = trigger.body;
      let url = trigger.url;

      // Reemplazar todas las variables {{variable}} con los datos del evento
      const replaceVars = (text: string): string => {
        return text.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
          return eventData[varName] !== undefined ? String(eventData[varName]) : `{{${varName}}}`;
        });
      };

      title = replaceVars(title);
      body = replaceVars(body);
      url = replaceVars(url);

      // Preparar payload
      const payload = {
        title,
        body,
        icon: trigger.icon || this.config.global.defaultIcon,
        url: url || this.config.global.defaultUrl,
      };

      // Obtener todos los suscriptores (o por segmento si se define)
      const subscribers = this.getSubscribersBySegment('all');

      if (subscribers.length === 0) {
        console.log(`[PUSH-AUTO] Evento "${triggerType}": sin suscriptores`);
        return;
      }

      // Enviar a todos los suscriptores
      let sentCount = 0;
      for (const { subscription, client } of subscribers) {
        const success = await this.pushService.sendToSubscription(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload
        );

        // Registrar en el log
        this.addToPushLog({
          id: `${Date.now()}_${client.id}_${triggerType}`,
          type: 'event',
          triggerType,
          clientId: client.id,
          title,
          body,
          sentAt: new Date().toISOString(),
          success,
        });

        if (success) {
          sentCount++;
        }
      }

      console.log(
        `[PUSH-AUTO] Evento "${triggerType}" enviado a ${sentCount} suscriptores`
      );
    } catch (err) {
      console.error(`[PUSH-AUTO] Error al enviar push de evento "${triggerType}":`, err);
    }
  }

  // ==========================================================================
  // Log de pushes enviados
  // ==========================================================================

  /**
   * Agrega una entrada al log de pushes enviados.
   * Mantiene solo las últimas 1000 entradas para no saturar el archivo.
   *
   * @param entry - Entrada del log a agregar
   */
  addToPushLog(entry: PushLogEntry): void {
    try {
      this.config.pushLog.push(entry);

      // Limpiar entradas antiguas, conservar solo las últimas 1000
      if (this.config.pushLog.length > 1000) {
        this.config.pushLog = this.config.pushLog.slice(-1000);
      }

      this.saveConfig();
    } catch (err) {
      console.error('[PUSH-AUTO] Error al agregar entrada al log:', err);
    }
  }

  // ==========================================================================
  // Estadísticas
  // ==========================================================================

  /**
   * Calcula y devuelve estadísticas de los pushes enviados.
   * Incluye totales diarios, semanales, por campaña y suscriptores activos.
   *
   * @returns Objeto con las estadísticas calculadas
   */
  getPushStats(): PushStats {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Calcular inicio de la semana (lunes)
      const weekStart = new Date(now);
      const dayOfWeek = weekStart.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      weekStart.setDate(weekStart.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString();

      // Filtrar solo envíos exitosos
      const successLog = this.config.pushLog.filter((e) => e.success);

      // Total enviados hoy
      const totalToday = successLog.filter((e) => e.sentAt.startsWith(today)).length;

      // Total enviados esta semana
      const totalThisWeek = successLog.filter((e) => e.sentAt >= weekStartStr).length;

      // Agrupado por campaña
      const byCampaign: Record<string, number> = {};
      for (const entry of successLog) {
        const key = entry.campaignId || entry.ruleId || entry.triggerType || 'other';
        byCampaign[key] = (byCampaign[key] || 0) + 1;
      }

      // Suscriptores activos (con clientId asociado)
      const subscriptions = this.dataService.getPushSubscriptions();
      const activeSubscribers = subscriptions.filter((s) => s.clientId !== null).length;

      return {
        totalToday,
        totalThisWeek,
        byCampaign,
        activeSubscribers,
      };
    } catch (err) {
      console.error('[PUSH-AUTO] Error al calcular estadísticas:', err);
      return {
        totalToday: 0,
        totalThisWeek: 0,
        byCampaign: {},
        activeSubscribers: 0,
      };
    }
  }

  // ==========================================================================
  // Plantillas
  // ==========================================================================

  /**
   * Devuelve todas las plantillas de notificación disponibles.
   *
   * @returns Array de plantillas
   */
  getTemplates(): PushTemplate[] {
    return this.config.templates;
  }

  /**
   * Busca y devuelve una plantilla específica por su ID.
   *
   * @param id - ID de la plantilla a buscar
   * @returns La plantilla encontrada o undefined
   */
  getTemplate(id: string): PushTemplate | undefined {
    return this.config.templates.find((t) => t.id === id);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Devuelve el nombre del día actual en inglés y minúsculas.
   * Utiliza la zona horaria configurada para determinar el día correcto.
   *
   * @returns Nombre del día (ej: 'monday', 'tuesday', etc.)
   */
  private getDayName(): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();
    // Obtener el día en la zona horaria configurada
    const dayStr = now.toLocaleString('en-US', {
      weekday: 'long',
      timeZone: this.config.global.timezone,
    });
    return dayStr.toLowerCase();
  }
}

// ============================================================================
// Exportaciones
// ============================================================================

export default PushAutomationService;

/**
 * Función factory para crear una instancia del servicio de automatización.
 * Facilita la creación sin necesidad de usar 'new' directamente.
 *
 * @param dataService - Instancia del servicio de datos
 * @param pushService - Instancia del servicio de push
 * @returns Nueva instancia de PushAutomationService
 */
export function createPushAutomation(
  dataService: DataService,
  pushService: PushService
): PushAutomationService {
  return new PushAutomationService(dataService, pushService);
}
