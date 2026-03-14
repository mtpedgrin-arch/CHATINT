import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';

const router = Router();

// Store active quiz timers
const quizTimers: Record<string, NodeJS.Timeout> = {};

// ============================================
// ADMIN ENDPOINTS (with auth)
// ============================================

// List all quizzes
router.get('/admin/quizzes', (_req: Request, res: Response) => {
  const quizzes = dataService.getQuizzes();
  const enriched = quizzes.map(q => ({
    ...q,
    totalAnswers: dataService.getQuizAnswers(q.id).length,
    correctAnswers: dataService.getQuizAnswers(q.id).filter(a => a.correct).length,
  }));
  res.json(enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

// Get quiz detail with answers
router.get('/admin/quizzes/:id', (req: Request, res: Response) => {
  const quiz = dataService.getQuizById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz no encontrado' });
  const answers = dataService.getQuizAnswers(quiz.id);
  const totalAnswers = answers.length;
  const correctAnswers = answers.filter(a => a.correct).length;
  res.json({ ...quiz, answers, totalAnswers, correctAnswers });
});

// Create quiz (draft)
router.post('/admin/quizzes', (req: Request, res: Response) => {
  try {
    const { question, options, correctIndex, prizeAmount, timeLimit } = req.body;
    if (!question || !options || options.length !== 4 || correctIndex === undefined || !prizeAmount) {
      return res.status(400).json({ error: 'Faltan campos: question, options (4), correctIndex, prizeAmount' });
    }
    const quiz = dataService.createQuiz({
      question,
      options,
      correctIndex: Number(correctIndex),
      prizeAmount: Number(prizeAmount),
      timeLimit: Number(timeLimit) || 10,
      status: 'draft',
      createdBy: 'admin',
    });
    res.json(quiz);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update quiz (only draft)
router.put('/admin/quizzes/:id', (req: Request, res: Response) => {
  const quiz = dataService.getQuizById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz no encontrado' });
  if (quiz.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden editar quizzes en borrador' });
  const updated = dataService.updateQuiz(req.params.id, req.body);
  res.json(updated);
});

// Delete quiz
router.delete('/admin/quizzes/:id', (req: Request, res: Response) => {
  const quiz = dataService.getQuizById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz no encontrado' });
  if (quiz.status === 'active') return res.status(400).json({ error: 'No se puede borrar un quiz activo' });
  dataService.deleteQuiz(req.params.id);
  res.json({ ok: true });
});

// Start quiz
router.post('/admin/quizzes/:id/start', (req: Request, res: Response) => {
  const quiz = dataService.getQuizById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz no encontrado' });
  if (quiz.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden iniciar quizzes en borrador' });

  // Check no other active quiz
  const active = dataService.getActiveQuiz();
  if (active) return res.status(400).json({ error: 'Ya hay un quiz activo. Terminalo primero.' });

  const now = new Date();
  const updated = dataService.updateQuiz(quiz.id, {
    status: 'active',
    startedAt: now.toISOString(),
  });

  const io = req.app.get('io');

  // Broadcast to all widgets (DO NOT send correctIndex!)
  if (io) {
    io.emit('quiz:started', {
      id: updated!.id,
      question: updated!.question,
      options: updated!.options,
      timeLimit: updated!.timeLimit,
      prizeAmount: updated!.prizeAmount,
    });
  }

  // Auto-end timer
  const timeoutMs = (quiz.timeLimit || 10) * 1000;
  quizTimers[quiz.id] = setTimeout(() => {
    endQuizAndReward(quiz.id, req.app);
    delete quizTimers[quiz.id];
  }, timeoutMs + 2000); // +2s grace period for network latency

  res.json(updated);
});

// End quiz manually
router.post('/admin/quizzes/:id/end', (req: Request, res: Response) => {
  const quiz = dataService.getQuizById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz no encontrado' });
  if (quiz.status !== 'active') return res.status(400).json({ error: 'El quiz no esta activo' });

  // Clear auto-end timer
  if (quizTimers[quiz.id]) {
    clearTimeout(quizTimers[quiz.id]);
    delete quizTimers[quiz.id];
  }

  endQuizAndReward(quiz.id, req.app);
  res.json({ ok: true });
});

// ============================================
// WIDGET ENDPOINTS (no auth)
// ============================================

// Get active quiz
router.get('/quizzes/active', (_req: Request, res: Response) => {
  const quiz = dataService.getActiveQuiz();
  if (!quiz) return res.json({ quiz: null });
  // DO NOT send correctIndex to widget!
  res.json({
    quiz: {
      id: quiz.id,
      question: quiz.question,
      options: quiz.options,
      timeLimit: quiz.timeLimit,
      prizeAmount: quiz.prizeAmount,
      startedAt: quiz.startedAt,
    },
  });
});

// Answer quiz
router.post('/quizzes/:id/answer', (req: Request, res: Response) => {
  const quiz = dataService.getQuizById(req.params.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz no encontrado' });
  if (quiz.status !== 'active') return res.status(400).json({ error: 'El quiz ya termino' });

  const { clientId, clientName, selectedIndex } = req.body;
  if (!clientId || selectedIndex === undefined) {
    return res.status(400).json({ error: 'clientId y selectedIndex son requeridos' });
  }

  // Check if already answered
  const existing = dataService.getQuizAnswerByClient(quiz.id, Number(clientId));
  if (existing) return res.status(400).json({ error: 'Ya respondiste este quiz', answer: existing });

  // Calculate time taken
  const timeMs = quiz.startedAt
    ? Date.now() - new Date(quiz.startedAt).getTime()
    : 0;

  const correct = Number(selectedIndex) === quiz.correctIndex;

  const answer = dataService.createQuizAnswer({
    quizId: quiz.id,
    clientId: Number(clientId),
    clientName: clientName || '',
    selectedIndex: Number(selectedIndex),
    correct,
    timeMs,
  });

  // Update quiz counters
  const answers = dataService.getQuizAnswers(quiz.id);
  dataService.updateQuiz(quiz.id, {
    totalAnswers: answers.length,
    correctAnswers: answers.filter(a => a.correct).length,
  });

  // Notify admin panel
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('quiz:answer', {
      quizId: quiz.id,
      clientName: clientName || `Cliente #${clientId}`,
      correct,
      totalAnswers: answers.length,
      correctAnswers: answers.filter(a => a.correct).length,
    });
  }

  res.json({ correct, answer });
});

// ============================================
// HELPERS
// ============================================

function endQuizAndReward(quizId: string, app: any) {
  const quiz = dataService.getQuizById(quizId);
  if (!quiz || quiz.status !== 'active') return;

  const answers = dataService.getQuizAnswers(quizId);
  const correctAnswers = answers.filter(a => a.correct);
  const totalAnswers = answers.length;

  // Update quiz status
  dataService.updateQuiz(quizId, {
    status: 'ended',
    endedAt: new Date().toISOString(),
    totalAnswers,
    correctAnswers: correctAnswers.length,
  });

  const io = app.get('io');

  // Credit prizes to winners
  correctAnswers.forEach(answer => {
    const client = dataService.getClientById(answer.clientId);
    if (client) {
      dataService.updateClient(answer.clientId, {
        balance: client.balance + quiz.prizeAmount,
      });

      // Notify winner via socket
      if (io) {
        io.to(`client:${answer.clientId}`).emit('quiz:winner', {
          quizId: quiz.id,
          prizeAmount: quiz.prizeAmount,
          question: quiz.question,
        });
      }
    }
  });

  // Broadcast quiz ended to all
  if (io) {
    io.emit('quiz:ended', {
      quizId: quiz.id,
      correctIndex: quiz.correctIndex,
      totalAnswers,
      correctAnswers: correctAnswers.length,
      prizeAmount: quiz.prizeAmount,
    });
  }

  console.log(`[Quiz] Quiz "${quiz.question}" ended. ${totalAnswers} answers, ${correctAnswers.length} correct. ${correctAnswers.length * quiz.prizeAmount} fichas repartidas.`);
}

export default router;
