import { dataService, PrizeTransaction } from './data.service';
import { casinoService } from './casino.service';

/**
 * Credit prize to a client with:
 * 1. Bonus adjustment (if active)
 * 2. Internal balance update
 * 3. Casino 463.life deposit (via casinoService)
 * 4. Transaction logging
 * 5. Socket notification
 *
 * Returns the transaction record + casino deposit result
 */
export async function creditPrizeAndDeposit(params: {
  clientId: number;
  clientName: string;
  source: PrizeTransaction['source'];
  sourceId: string;
  amount: number;
  io?: any; // Socket.IO instance
}): Promise<{ tx: PrizeTransaction | null; casinoDeposit: { success: boolean; error?: string; newBalance?: number } }> {

  // 1. Credit internally (handles bonus calculation)
  const tx = dataService.creditPrize({
    clientId: params.clientId,
    clientName: params.clientName,
    source: params.source,
    sourceId: params.sourceId,
    amount: params.amount,
  });

  if (!tx) {
    console.error(`[CreditPrize] Failed: client ${params.clientId} not found`);
    return { tx: null, casinoDeposit: { success: false, error: 'Client not found' } };
  }

  // 2. Deposit in Casino 463.life (the ACTUAL chip loading)
  let casinoDeposit: { success: boolean; error?: string; newBalance?: number } = { success: false, error: 'Not configured' };
  const client = dataService.getClientById(params.clientId);
  const casinoUsername = client?.usuario;

  if (casinoUsername) {
    // Always refresh config before checking
    casinoService.configureFromStore();

    if (casinoService.configured) {
      try {
        // Deposit the CREDITED amount (already adjusted for bonus)
        casinoDeposit = await casinoService.depositCredits(casinoUsername, tx.creditedAmount);

        if (casinoDeposit.success) {
          console.log(`[CreditPrize→Casino] ✅ ${casinoUsername} +$${tx.creditedAmount} (${params.source}) newBalance: ${casinoDeposit.newBalance}`);
        } else {
          console.error(`[CreditPrize→Casino] ❌ ${casinoUsername}: ${casinoDeposit.error}`);
        }
      } catch (err: any) {
        console.error(`[CreditPrize→Casino] ❌ Exception: ${err.message}`);
        casinoDeposit = { success: false, error: err.message, newBalance: undefined };
      }
    } else {
      console.log(`[CreditPrize→Casino] ⚠️ Skipped: casino not configured (username=${casinoUsername})`);
    }
  } else {
    console.log(`[CreditPrize→Casino] ⚠️ Skipped: client ${params.clientId} has no casino username`);
  }

  // 3. Emit popup notification to widget (like "FICHAS CARGADAS")
  if (params.io && casinoDeposit.success) {
    // Find client's chat to send popup
    const chats = dataService.getChats().filter(c => c.clientId === params.clientId);
    const activeChat = chats.find(c => c.status !== 'resolved') || chats[0];

    if (activeChat) {
      // Send chat message confirming the prize
      const sourceLabel = params.source === 'scratch' ? 'Raspa y Gana' :
        params.source === 'roulette' ? 'Ruleta' :
        params.source === 'quiz' ? 'Quiz' :
        params.source === 'event' ? 'Sorteo' :
        params.source === 'mission' ? 'Misión' : 'Premio';

      const bonusText = tx.bonusActive
        ? ` (${tx.creditedAmount} fichas + bono ${tx.bonusPercentage}% = ${tx.originalAmount} fichas)`
        : '';

      const msg = dataService.addChatMessage({
        chatId: activeChat.id,
        sender: 'bot',
        senderName: 'Casino 463',
        text: `🎉 ¡Felicitaciones! Ganaste $${tx.originalAmount.toLocaleString()} en ${sourceLabel}. Se acreditaron $${tx.creditedAmount.toLocaleString()} fichas en tu cuenta${bonusText}. ¡A seguir jugando!`,
        type: 'text',
      });

      params.io.to(`chat:${activeChat.id}`).emit('message:new', msg);
      params.io.to('agents').emit('message:new', msg);
    }

    // Emit prize:credited event to client room (for widget popup)
    params.io.to(`client:${params.clientId}`).emit('prize:credited', {
      source: params.source,
      originalAmount: tx.originalAmount,
      creditedAmount: tx.creditedAmount,
      bonusActive: tx.bonusActive,
      bonusPercentage: tx.bonusPercentage,
    });
  }

  return { tx, casinoDeposit };
}
