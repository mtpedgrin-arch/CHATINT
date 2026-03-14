import { Router, Request, Response } from 'express';
import PushAutomationService from '../services/push-automation.service';

// ============================================================================
// Rutas de Automatización de Push Notifications
// ============================================================================

/**
 * Crea y devuelve un Router de Express con todos los endpoints para gestionar
 * el sistema de automatización de push notifications desde el panel admin.
 *
 * Se asume que el router se monta en /api/push-automation
 *
 * @param pushAutomation - Instancia del servicio de automatización de push
 * @returns Router de Express configurado
 */
export function createPushAutomationRouter(pushAutomation: PushAutomationService): Router {
  const router = Router();

  // ==========================================================================
  // CONFIGURACIÓN
  // ==========================================================================

  /** GET /config - Obtener la configuración completa de automatización */
  router.get('/config', (_req: Request, res: Response) => {
    try {
      const config = pushAutomation.getConfig();
      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al obtener configuración:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /config/global - Actualizar configuración global (enabled, timezone, quiet hours, etc.) */
  router.put('/config/global', (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, error: 'Se requieren datos para actualizar' });
      }
      pushAutomation.updateConfig('global', data);
      res.json({ success: true, data: pushAutomation.getConfig().global });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar config global:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /config/inactivity - Actualizar configuración de inactividad (enabled + rules) */
  router.put('/config/inactivity', (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, error: 'Se requieren datos para actualizar' });
      }
      pushAutomation.updateConfig('inactivity', data);
      res.json({ success: true, data: pushAutomation.getConfig().inactivity });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar config de inactividad:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /config/scheduled - Actualizar configuración de campañas programadas */
  router.put('/config/scheduled', (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, error: 'Se requieren datos para actualizar' });
      }
      pushAutomation.updateConfig('scheduled', data);
      res.json({ success: true, data: pushAutomation.getConfig().scheduled });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar config de campañas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /config/events - Actualizar configuración de triggers de eventos */
  router.put('/config/events', (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, error: 'Se requieren datos para actualizar' });
      }
      pushAutomation.updateConfig('events', data);
      res.json({ success: true, data: pushAutomation.getConfig().events });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar config de eventos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /config/reload - Forzar recarga de configuración desde el archivo JSON */
  router.post('/config/reload', (_req: Request, res: Response) => {
    try {
      const config = pushAutomation.reloadConfig();
      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al recargar configuración:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // GESTIÓN DE CAMPAÑAS PROGRAMADAS
  // ==========================================================================

  /** GET /campaigns - Obtener todas las campañas programadas */
  router.get('/campaigns', (_req: Request, res: Response) => {
    try {
      const config = pushAutomation.getConfig();
      res.json({ success: true, data: config.scheduled.campaigns });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al obtener campañas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /campaigns - Crear una nueva campaña programada */
  router.post('/campaigns', (req: Request, res: Response) => {
    try {
      const { name, days, time, title, body, url, segment } = req.body;

      // Validaciones básicas
      if (!name || !title || !body) {
        return res.status(400).json({ success: false, error: 'Se requieren name, title y body' });
      }
      if (!days || !Array.isArray(days) || days.length === 0) {
        return res.status(400).json({ success: false, error: 'Se requiere un array de días (days)' });
      }
      if (!time) {
        return res.status(400).json({ success: false, error: 'Se requiere la hora de envío (time)' });
      }

      // Generar ID único basado en timestamp
      const id = `campaign_${Date.now()}`;

      // Crear la nueva campaña con enabled: false por defecto
      const newCampaign = {
        id,
        name,
        enabled: false,
        days,
        time,
        title,
        body,
        icon: req.body.icon || '',
        url: url || '',
        segment: segment || 'all',
      };

      // Agregar la campaña a la configuración existente
      const config = pushAutomation.getConfig();
      config.scheduled.campaigns.push(newCampaign);
      pushAutomation.updateConfig('scheduled', config.scheduled);

      res.status(201).json({ success: true, data: newCampaign });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al crear campaña:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /campaigns/:id - Actualizar una campaña existente (incluye enable/disable) */
  router.put('/campaigns/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const config = pushAutomation.getConfig();
      const campaignIndex = config.scheduled.campaigns.findIndex((c) => c.id === id);

      if (campaignIndex === -1) {
        return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
      }

      // Merge de los datos actualizados con la campaña existente
      config.scheduled.campaigns[campaignIndex] = {
        ...config.scheduled.campaigns[campaignIndex],
        ...req.body,
        id, // Asegurar que el ID no se sobrescriba
      };

      pushAutomation.updateConfig('scheduled', config.scheduled);

      res.json({ success: true, data: config.scheduled.campaigns[campaignIndex] });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar campaña:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** DELETE /campaigns/:id - Eliminar una campaña programada */
  router.delete('/campaigns/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const config = pushAutomation.getConfig();
      const campaignIndex = config.scheduled.campaigns.findIndex((c) => c.id === id);

      if (campaignIndex === -1) {
        return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
      }

      // Eliminar la campaña del array
      const removed = config.scheduled.campaigns.splice(campaignIndex, 1)[0];
      pushAutomation.updateConfig('scheduled', config.scheduled);

      res.json({ success: true, data: removed });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al eliminar campaña:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /campaigns/:id/toggle - Alternar el estado enabled/disabled de una campaña */
  router.post('/campaigns/:id/toggle', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const config = pushAutomation.getConfig();
      const campaign = config.scheduled.campaigns.find((c) => c.id === id);

      if (!campaign) {
        return res.status(404).json({ success: false, error: 'Campaña no encontrada' });
      }

      // Invertir el estado
      campaign.enabled = !campaign.enabled;
      pushAutomation.updateConfig('scheduled', config.scheduled);

      res.json({ success: true, data: campaign });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al alternar campaña:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // PLANTILLAS DE NOTIFICACIÓN
  // ==========================================================================

  /** GET /templates - Obtener todas las plantillas de notificación */
  router.get('/templates', (_req: Request, res: Response) => {
    try {
      const templates = pushAutomation.getTemplates();
      res.json({ success: true, data: templates });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al obtener plantillas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /templates - Crear una nueva plantilla de notificación */
  router.post('/templates', (req: Request, res: Response) => {
    try {
      const { name, category, title, body, icon, url } = req.body;

      // Validaciones básicas
      if (!name || !title || !body) {
        return res.status(400).json({ success: false, error: 'Se requieren name, title y body' });
      }

      // Generar ID único
      const id = `template_${Date.now()}`;

      const newTemplate = {
        id,
        name,
        category: category || 'general',
        title,
        body,
        icon: icon || '',
        url: url || '',
      };

      // Agregar la plantilla a la configuración
      const config = pushAutomation.getConfig();
      config.templates.push(newTemplate);
      pushAutomation.updateConfig('templates', config.templates);

      res.status(201).json({ success: true, data: newTemplate });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al crear plantilla:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /templates/:id - Actualizar una plantilla existente */
  router.put('/templates/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const config = pushAutomation.getConfig();
      const templateIndex = config.templates.findIndex((t) => t.id === id);

      if (templateIndex === -1) {
        return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
      }

      // Merge de los datos actualizados con la plantilla existente
      config.templates[templateIndex] = {
        ...config.templates[templateIndex],
        ...req.body,
        id, // Asegurar que el ID no se sobrescriba
      };

      pushAutomation.updateConfig('templates', config.templates);

      res.json({ success: true, data: config.templates[templateIndex] });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar plantilla:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** DELETE /templates/:id - Eliminar una plantilla de notificación */
  router.delete('/templates/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const config = pushAutomation.getConfig();
      const templateIndex = config.templates.findIndex((t) => t.id === id);

      if (templateIndex === -1) {
        return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
      }

      // Eliminar la plantilla del array
      const removed = config.templates.splice(templateIndex, 1)[0];
      pushAutomation.updateConfig('templates', config.templates);

      res.json({ success: true, data: removed });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al eliminar plantilla:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // ACCIONES MANUALES DE ENVÍO
  // ==========================================================================

  /** POST /send-template/:templateId - Enviar una plantilla a un segmento ahora */
  router.post('/send-template/:templateId', async (req: Request, res: Response) => {
    try {
      const { templateId } = req.params;
      const { segment } = req.body;

      // Validar segmento
      const validSegments = ['all', 'vip', 'active', 'inactive', 'new', 'highValue'];
      if (!segment || !validSegments.includes(segment)) {
        return res.status(400).json({
          success: false,
          error: `Se requiere un segmento válido: ${validSegments.join(', ')}`,
        });
      }

      // Buscar la plantilla
      const template = pushAutomation.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
      }

      // Obtener suscriptores del segmento
      const subscribers = pushAutomation.getSubscribersBySegment(segment);
      if (subscribers.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No hay suscriptores en el segmento "${segment}"`,
        });
      }

      // Enviar la notificación a cada suscriptor
      let sent = 0;
      let failed = 0;

      for (const { subscription, client } of subscribers) {
        // Verificar límite diario del usuario
        if (!pushAutomation.canSendToUser(client.id)) {
          failed++;
          continue;
        }

        const payload = {
          title: template.title,
          body: template.body,
          icon: template.icon || undefined,
          url: template.url || undefined,
        };

        // Se usa sendEventPush indirectamente: registrar en el log manualmente
        // Para envío directo, usamos el servicio de push a través del servicio de automatización
        const success = await (pushAutomation as any).pushService.sendToSubscription(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload
        );

        // Registrar en el log
        pushAutomation.addToPushLog({
          id: `${Date.now()}_${client.id}_template_${templateId}`,
          type: 'manual_template',
          campaignId: templateId,
          clientId: client.id,
          title: template.title,
          body: template.body,
          sentAt: new Date().toISOString(),
          success,
        });

        if (success) {
          sent++;
        } else {
          failed++;
        }
      }

      res.json({
        success: true,
        data: {
          templateId,
          segment,
          totalSubscribers: subscribers.length,
          sent,
          failed,
        },
      });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al enviar plantilla:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /send-custom - Enviar una notificación push personalizada ahora */
  router.post('/send-custom', async (req: Request, res: Response) => {
    try {
      const { title, body, url, segment } = req.body;

      // Validaciones básicas
      if (!title || !body) {
        return res.status(400).json({ success: false, error: 'Se requieren title y body' });
      }

      const targetSegment = segment || 'all';

      // Obtener suscriptores del segmento
      const subscribers = pushAutomation.getSubscribersBySegment(targetSegment);
      if (subscribers.length === 0) {
        return res.status(400).json({
          success: false,
          error: `No hay suscriptores en el segmento "${targetSegment}"`,
        });
      }

      // Enviar la notificación a cada suscriptor
      let sent = 0;
      let failed = 0;

      for (const { subscription, client } of subscribers) {
        // Verificar límite diario del usuario
        if (!pushAutomation.canSendToUser(client.id)) {
          failed++;
          continue;
        }

        const payload = {
          title,
          body,
          url: url || undefined,
        };

        const success = await (pushAutomation as any).pushService.sendToSubscription(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload
        );

        // Registrar en el log
        pushAutomation.addToPushLog({
          id: `${Date.now()}_${client.id}_custom`,
          type: 'manual_custom',
          clientId: client.id,
          title,
          body,
          sentAt: new Date().toISOString(),
          success,
        });

        if (success) {
          sent++;
        } else {
          failed++;
        }
      }

      res.json({
        success: true,
        data: {
          segment: targetSegment,
          totalSubscribers: subscribers.length,
          sent,
          failed,
        },
      });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al enviar push personalizado:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /send-event - Disparar un push de evento manualmente */
  router.post('/send-event', async (req: Request, res: Response) => {
    try {
      const { triggerType, eventData } = req.body;

      // Validaciones
      if (!triggerType) {
        return res.status(400).json({ success: false, error: 'Se requiere triggerType' });
      }
      if (!eventData || typeof eventData !== 'object') {
        return res.status(400).json({ success: false, error: 'Se requiere eventData como objeto' });
      }

      // Delegar al servicio de automatización
      await pushAutomation.sendEventPush(triggerType, eventData);

      res.json({
        success: true,
        data: { triggerType, eventData },
      });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al enviar push de evento:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // ESTADÍSTICAS Y LOGS
  // ==========================================================================

  /** GET /stats - Obtener estadísticas de push automation */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const stats = pushAutomation.getPushStats();
      res.json({ success: true, data: stats });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al obtener estadísticas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** GET /logs - Obtener el log de pushes enviados con filtros opcionales */
  router.get('/logs', (req: Request, res: Response) => {
    try {
      const config = pushAutomation.getConfig();
      let logs = [...config.pushLog];

      // Filtrar por clientId si se proporciona
      if (req.query.clientId) {
        const clientId = parseInt(req.query.clientId as string, 10);
        logs = logs.filter((entry) => entry.clientId === clientId);
      }

      // Filtrar por tipo si se proporciona
      if (req.query.type) {
        const type = req.query.type as string;
        logs = logs.filter((entry) => entry.type === type);
      }

      // Filtrar por campaignId si se proporciona
      if (req.query.campaignId) {
        const campaignId = req.query.campaignId as string;
        logs = logs.filter((entry) => entry.campaignId === campaignId);
      }

      // Ordenar del más reciente al más antiguo
      logs.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

      // Limitar la cantidad de resultados
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      logs = logs.slice(0, limit);

      res.json({ success: true, data: logs, total: config.pushLog.length });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al obtener logs:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // CONTROL DEL SERVICIO
  // ==========================================================================

  /** POST /start - Iniciar la automatización (habilita y arranca el ciclo) */
  router.post('/start', (_req: Request, res: Response) => {
    try {
      // Habilitar en la configuración global
      pushAutomation.updateConfig('global', { enabled: true });

      // Iniciar el ciclo de automatización
      pushAutomation.start();

      res.json({ success: true, data: { message: 'Automatización iniciada correctamente' } });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al iniciar automatización:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /stop - Detener la automatización (deshabilita y detiene el ciclo) */
  router.post('/stop', (_req: Request, res: Response) => {
    try {
      // Detener el ciclo de automatización
      pushAutomation.stop();

      // Deshabilitar en la configuración global
      pushAutomation.updateConfig('global', { enabled: false });

      res.json({ success: true, data: { message: 'Automatización detenida correctamente' } });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al detener automatización:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** GET /status - Obtener el estado actual del sistema de automatización */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const config = pushAutomation.getConfig();
      const stats = pushAutomation.getPushStats();

      // Determinar si el servicio está corriendo (tiene intervalo activo)
      const isRunning = config.global.enabled;

      res.json({
        success: true,
        data: {
          running: isRunning,
          global: {
            enabled: config.global.enabled,
            timezone: config.global.timezone,
            checkIntervalMinutes: config.global.checkIntervalMinutes,
            maxPushesPerUserPerDay: config.global.maxPushesPerUserPerDay,
            quietHoursStart: config.global.quietHoursStart,
            quietHoursEnd: config.global.quietHoursEnd,
          },
          modules: {
            inactivity: config.inactivity.enabled,
            scheduled: config.scheduled.enabled,
            events: config.events.enabled,
          },
          campaigns: {
            total: config.scheduled.campaigns.length,
            active: config.scheduled.campaigns.filter((c) => c.enabled).length,
          },
          templates: config.templates.length,
          subscribers: stats.activeSubscribers,
          stats: {
            totalToday: stats.totalToday,
            totalThisWeek: stats.totalThisWeek,
          },
          isQuietHours: pushAutomation.isQuietHours(),
        },
      });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al obtener estado:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // REGLAS DE INACTIVIDAD
  // ==========================================================================

  /** POST /inactivity/rules - Agregar una nueva regla de inactividad */
  router.post('/inactivity/rules', (req: Request, res: Response) => {
    try {
      const { daysInactive, title, body, icon, url, onlyOnce } = req.body;

      // Validaciones básicas
      if (daysInactive === undefined || daysInactive === null) {
        return res.status(400).json({ success: false, error: 'Se requiere daysInactive' });
      }
      if (!title || !body) {
        return res.status(400).json({ success: false, error: 'Se requieren title y body' });
      }

      // Crear la nueva regla
      const newRule = {
        daysInactive: parseInt(daysInactive, 10),
        title,
        body,
        icon: icon || '',
        url: url || '',
        onlyOnce: onlyOnce !== undefined ? Boolean(onlyOnce) : true,
      };

      // Agregar al array de reglas
      const config = pushAutomation.getConfig();
      config.inactivity.rules.push(newRule);

      // Ordenar reglas por daysInactive ascendente para mantener consistencia
      config.inactivity.rules.sort((a, b) => a.daysInactive - b.daysInactive);

      pushAutomation.updateConfig('inactivity', config.inactivity);

      res.status(201).json({ success: true, data: newRule });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al agregar regla de inactividad:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** PUT /inactivity/rules/:index - Actualizar una regla de inactividad por índice */
  router.put('/inactivity/rules/:index', (req: Request, res: Response) => {
    try {
      const index = parseInt(req.params.index, 10);
      const config = pushAutomation.getConfig();

      // Validar que el índice sea válido
      if (isNaN(index) || index < 0 || index >= config.inactivity.rules.length) {
        return res.status(404).json({ success: false, error: 'Índice de regla inválido o fuera de rango' });
      }

      // Merge de los datos actualizados con la regla existente
      config.inactivity.rules[index] = {
        ...config.inactivity.rules[index],
        ...req.body,
      };

      pushAutomation.updateConfig('inactivity', config.inactivity);

      res.json({ success: true, data: config.inactivity.rules[index] });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al actualizar regla de inactividad:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** DELETE /inactivity/rules/:index - Eliminar una regla de inactividad por índice */
  router.delete('/inactivity/rules/:index', (req: Request, res: Response) => {
    try {
      const index = parseInt(req.params.index, 10);
      const config = pushAutomation.getConfig();

      // Validar que el índice sea válido
      if (isNaN(index) || index < 0 || index >= config.inactivity.rules.length) {
        return res.status(404).json({ success: false, error: 'Índice de regla inválido o fuera de rango' });
      }

      // Eliminar la regla del array
      const removed = config.inactivity.rules.splice(index, 1)[0];
      pushAutomation.updateConfig('inactivity', config.inactivity);

      res.json({ success: true, data: removed });
    } catch (err: any) {
      console.error('[PUSH-AUTO-ROUTES] Error al eliminar regla de inactividad:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================================================
  // GUARDAR CONFIGURACIÓN COMPLETA Y STATS
  // ==========================================================================

  // Save ALL config at once (single save button from frontend)
  router.put('/config/all', (req: Request, res: Response) => {
    try {
      const data = req.body;
      const currentConfig = pushAutomation.getConfig();

      // Preserve pushLog — frontend should not send it
      const pushLog = currentConfig.pushLog || [];

      // Update each section
      const sections = ['global', 'inactivity', 'scheduled', 'events', 'reconsumo', 'urgencia', 'onboarding', 'segments', 'templates'];
      for (const section of sections) {
        if (data[section] !== undefined) {
          pushAutomation.updateConfig(section as any, data[section]);
        }
      }

      // Restore pushLog
      pushAutomation.updateConfig('pushLog' as any, pushLog);

      res.json({ ok: true, message: 'Configuración completa guardada' });
    } catch (err) {
      res.status(500).json({ error: 'Error al guardar configuración' });
    }
  });

  // Get push subscribers stats
  router.get('/push-subscribers-stats', (req: Request, res: Response) => {
    try {
      const dataService = require('../services/data.service').default;
      const clients = dataService.getClients();
      const subs = dataService.getPushSubscriptions();

      const clientsWithPush = new Set(subs.filter((s: any) => s.clientId).map((s: any) => s.clientId));

      res.json({
        totalClients: clients.length,
        clientsWithPush: clientsWithPush.size,
        adoptionRate: clients.length > 0 ? Math.round((clientsWithPush.size / clients.length) * 100) : 0,
      });
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener stats' });
    }
  });

  return router;
}

export default createPushAutomationRouter;
