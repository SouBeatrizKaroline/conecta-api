import type { EventPage, EventTarget } from '../types.ts';

interface ContextEvent {
  type: string;
  target: string;
}

export function sessionContext(events: ContextEvent[], consent: boolean) {
  const result = (rule: string, nextStep: string, reason: string, page: EventPage, target: EventTarget) => ({
    nextStep,
    recommendation: { rule, reason, page, target, ruleVersion: '1', simulated: true },
  });
  if (!consent)
    return result('collection-disabled', 'Você pode continuar navegando com a coleta desativada.', 'A coleta desta sessão está desativada.', 'home', 'page');
  if (events.some((event) => event.type === 'journey_completed'))
    return result('completed', 'Explore outras oportunidades quando desejar.', 'Há uma conclusão demonstrativa nesta sessão.', 'oportunidades', 'explorar');
  const help = events.filter((event) => event.type === 'click' && event.target === 'ajuda').length;
  if (help >= 2)
    return result('repeated-help', 'Consulte a orientação para o próximo passo da jornada.', `${help} cliques em ajuda nesta sessão; isso não comprova dificuldade.`, 'ajuda', 'ajuda');
  const preference = events.findLast(
    (event) => event.type === 'preference' && ['energia', 'tecnologia', 'servicos'].includes(event.target),
  );
  if (preference)
    return result('explicit-interest', `Explore oportunidades de ${preference.target}.`, 'Sugestão baseada na última preferência explícita desta sessão.', 'oportunidades', preference.target as EventTarget);
  if (events.some((event) => event.type === 'click' && event.target === 'explorar'))
    return result('exploring', 'Escolha uma área de interesse para orientar sua exploração.', 'Foi observado um clique em explorar nesta sessão.', 'preferencias', 'page');
  return result('welcome', 'Explore oportunidades e peça ajuda quando precisar.', 'Ainda não há um sinal específico nesta sessão.', 'oportunidades', 'explorar');
}

