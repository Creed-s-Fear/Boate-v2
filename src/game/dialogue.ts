/**
 * Sistema de diálogo das anfitriãs. Cada uma tem personalidade própria
 * e ativamente influencia o jogador a gastar (drinks, gorjetas, suíte).
 * Roda inteiramente no cliente (sem servidor, sem IA externa).
 */

export interface DialogueOption {
  text: string;
  reply: string;
  aff: number;
}

export interface DialogueRound {
  line: string;
  options: DialogueOption[];
}

interface PersonalityData {
  greetLow: string[];
  greetMid: string[];
  greetHigh: string[];
  roundsLow: DialogueRound[];
  roundsMid: DialogueRound[];
  roundsHigh: DialogueRound[];
  inviteAccept: string;
  inviteTease: string;
  roomGreet: string[];
  roomRounds: DialogueRound[];
}

// ================================================================ Valentina — Sofisticada, sabe cobrar caro
const VALENTINA: PersonalityData = {
  greetLow: [
    'Oi. Vai ficar me olhando de longe a noite toda?',
    'Hm, pelo menos veio falar. A maioria só fica encarando.',
    'Boa noite. Tô aceitando companhia — se for boa.',
  ],
  greetMid: [
    'Ah, voltou. Tava quase achando que desistiu de mim.',
    'Oi de novo. Dessa vez trouxe champagne ou só conversa?',
    'Ei. Senta aqui que eu tava sem ninguém interessante.',
  ],
  greetHigh: [
    'Até que enfim. A noite tava arrastando sem você.',
    'Vem, já guardei um lugar do meu lado.',
    'Oi, lindo. Achei que não vinha mais.',
  ],
  roundsLow: [
    {
      line: 'Sabe o que eu gosto num homem? Atitude. Chega aqui e pede um drink pra mim.',
      options: [
        { text: 'Feito. O que você bebe?', reply: 'Hm, gostei. Pede um Olho Mágico. E pede um pra você também.', aff: 10 },
        { text: 'Calma, nem te conheço ainda.', reply: 'Pois é, mas se quer conhecer, começa investindo, né?', aff: -2 },
        { text: 'Pra que drink? Minha companhia não basta?', reply: 'Fofo, mas nessa casa a gente brinda antes de conversar.', aff: 3 },
      ],
    },
    {
      line: 'Eu sou exigente, já aviso. Mas quem passa do meu filtro não se arrepende.',
      options: [
        { text: 'Gosto de desafio.', reply: 'Bom. Então me mostra que você é diferente desses caras aí.', aff: 10 },
        { text: 'Exigente como? O que te conquista?', reply: 'Generosidade, atenção, e saber a hora certa de calar a boca. Nessa ordem.', aff: 8 },
        { text: 'Ui, metida.', reply: 'Querido, não é metida. É filtro. Funciona.', aff: -6 },
      ],
    },
    {
      line: 'Cê viu aquelas cabines ali? Tem gente que reserva só pra ter privacidade comigo.',
      options: [
        { text: 'E como faz pra reservar?', reply: 'No terminal da Lívia. Mas calma, primeiro me convence que vale meu tempo.', aff: 8 },
        { text: 'Deve ser caro.', reply: 'É. Mas as coisas boas são. Você parece entender isso.', aff: 6 },
        { text: 'Hm, interessante. E vale a pena?', reply: 'Se eu tiver afim da pessoa? Vale cada centavo.', aff: 10 },
      ],
    },
  ],
  roundsMid: [
    {
      line: 'Ei, tô com sede. Me paga mais um drink? A gente conversa melhor assim.',
      options: [
        { text: 'Claro, vou pedir.', reply: 'Assim que eu gosto. Prático e generoso.', aff: 12 },
        { text: 'Outro? Já paguei um antes.', reply: 'E? A noite é longa, querido.', aff: -3 },
        { text: 'Só se vier com uma dança depois.', reply: 'Hm, negociando comigo? Tá, aceito. Mas o drink vem primeiro.', aff: 8 },
      ],
    },
    {
      line: 'Sabe, eu tava pensando... faz tempo que não vou pra suíte com alguém que preste.',
      options: [
        { text: 'É uma indireta?', reply: 'Tô só dizendo que se alguém me convidasse... talvez eu aceitasse. Talvez.', aff: 14 },
        { text: 'Posso mudar isso. Me dá uma chance.', reply: 'Humm. Gostei da confiança. Continua assim.', aff: 12 },
        { text: 'Tem fila, imagino.', reply: 'Fila tem. Mas eu escolho quem entra. E tô te olhando.', aff: 10 },
      ],
    },
    {
      line: 'Vou ser sincera: se me der uma gorjeta boa, conto um segredo.',
      options: [
        { text: 'Feito. Toma aí.', reply: 'O segredo: eu tô afim de ir pra suíte contigo. Pronto, falei.', aff: 15 },
        { text: 'Segredo? Que tipo?', reply: 'O tipo que te deixa com vontade de me levar pro andar de cima.', aff: 10 },
        { text: 'Não pago por segredo.', reply: 'Tá bom, guardarei pra mim. Mas ia gostar de ouvir, hein.', aff: -4 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: 'Chega de enrolação. Reserva a suíte e me leva. Tô pronta.',
      options: [
        { text: 'Vou reservar agora.', reply: 'Boa. Te espero. Não demora.', aff: 15 },
        { text: 'Calma, vamos curtir mais aqui primeiro.', reply: 'Tá, mas não me faz esperar muito. Minha paciência tem prazo.', aff: 5 },
        { text: 'Pronta pra quê, exatamente?', reply: 'Pra tudo que você tiver coragem de fazer. Bora?', aff: 12 },
      ],
    },
    {
      line: 'Quer saber como é a suíte comigo? Me convida e descobre.',
      options: [
        { text: 'Tô convencido. Bora.', reply: 'Finalmente. Vamos.', aff: 18 },
        { text: 'Fala mais, tô quase.', reply: 'Dança privada, champagne, jacuzzi... e eu. Precisa de mais?', aff: 12 },
        { text: 'Deve ser bom mesmo.', reply: 'Querido, "bom" é pouco. Mas só vai saber se for.', aff: 10 },
      ],
    },
  ],
  inviteAccept: 'Combinado. Te encontro lá. Leva champagne.',
  inviteTease: 'Quase. Mas eu preciso de mais atenção antes. Continua tentando.',
  roomGreet: [
    'Hm, gostei da suíte. Escolheu bem a luz.',
    'Finalmente a sós. Tranca a porta.',
    'Essa jacuzzi tá me chamando. Você vem?',
  ],
  roomRounds: [
    {
      line: 'Relaxa. Aqui é só a gente. Quer pedir uma dança privada?',
      options: [
        { text: 'Quero sim. Dança pra mim.', reply: 'Hm. Pede no painel ali, que eu começo.', aff: 12 },
        { text: 'Prefiro ficar conversando.', reply: 'Tá bom, mas não perde a chance. Minha dança é especial.', aff: 6 },
        { text: 'Quero tudo que tiver.', reply: 'Ambicioso. Gosto. Vamos por partes.', aff: 10 },
      ],
    },
    {
      line: 'Pede o champagne pra gente. A noite fica melhor.',
      options: [
        { text: 'Já vou pedir.', reply: 'Assim que é bom. Brinda comigo.', aff: 12 },
        { text: 'De novo? Já bebemos.', reply: 'E? A garrafa não enche sozinha, amor.', aff: -2 },
        { text: 'Só se for na jacuzzi.', reply: 'Ooh. Adorei a ideia. Bora.', aff: 14 },
      ],
    },
  ],
};

// ================================================================ Yasmin — Gente boa, sabe envolver na risada
const YASMIN: PersonalityData = {
  greetLow: [
    'Eiii, fala aí! Tava te olhando de lá. Bora conversar?',
    'Oi oi! Achei que ia ficar de canto a noite toda. Que bom que veio!',
    'E aí? Curtindo? Essa música tá boa demais, né?',
  ],
  greetMid: [
    'Voltou! Haha, eu sabia!',
    'Ei, aí sim! Achei que tinha fugido de mim.',
    'Aeee! Meu amigo favorito chegou! Pede um drink aí!',
  ],
  greetHigh: [
    'AI, oi! Que saudade! Vem vem vem!',
    'Até que enfim! Tava morrendo de tédio sem você!',
    'Cheguei toda animada já, pode vir!',
  ],
  roundsLow: [
    {
      line: 'Ei, me paga um drink? Prometo que fico mais engraçada depois. Brincadeira. Ou não.',
      options: [
        { text: 'Haha, bora! Pede o que quiser.', reply: 'Ebaaa! Pede dois, que beber sozinha é triste! Haha!', aff: 12 },
        { text: 'Tá querendo me secar, hein?', reply: 'Que isso! É só um drinkzinho! O segundo você decide depois. Hehe.', aff: 5 },
        { text: 'Não, obrigado.', reply: 'Ah, sem graça. Tá bem, conversa então. Mas saiba que bebo melhor que falo.', aff: -3 },
      ],
    },
    {
      line: 'Cê dança? Porque quem não dança comigo não me merece. Regra da casa.',
      options: [
        { text: 'Danço mal, mas vou tentar!', reply: 'Isso! Ninguém liga se dança mal, liga se não tenta! Bora!', aff: 14 },
        { text: 'Dançar? Sou mais de ficar sentado.', reply: 'Ah não, que preguiça! Vou te arrastar. Depois não reclama.', aff: 2 },
        { text: 'Só danço colado.', reply: 'Hahaha! Calma! Me conquista primeiro, pô!', aff: 8 },
      ],
    },
    {
      line: 'Sabia que tem uma suíte lá atrás? Com jacuzzi e tudo. Já foi?',
      options: [
        { text: 'Ainda não. Me leva?', reply: 'Haha, calma! Primeiro a gente se conhece, depois eu penso. Me paga um drink.', aff: 8 },
        { text: 'Já ouvi falar. Dizem que é top.', reply: 'É SIM. E comigo lá é melhor ainda, modéstia à parte. Hehe.', aff: 10 },
        { text: 'Suíte? Tô de boa aqui.', reply: 'Ah, cê que sabe! Mas se mudar de ideia, eu tô aqui, hein.', aff: 3 },
      ],
    },
  ],
  roundsMid: [
    {
      line: 'Ei, tô com sede de novo! Me paga outro? Esse papo tá bom demais pra parar.',
      options: [
        { text: 'Bora! Mais um pra gente!', reply: 'Yaaay! Cê é gente fina demais! Saúde!', aff: 12 },
        { text: 'Já paguei um, pô.', reply: 'E tá contando? Haha! Tá bom, bebo água. Brincadeira, paga vai!', aff: 2 },
        { text: 'Vou pagar, mas me deve uma dança.', reply: 'Feito! Dança + drink = noite perfeita!', aff: 10 },
      ],
    },
    {
      line: 'Cê parece legal de verdade. A maioria dos caras aqui é meio... sei lá. Cê é diferente.',
      options: [
        { text: 'Obrigado. Você também é especial.', reply: 'Oown! Para! Haha! ...Continua, gostei!', aff: 12 },
        { text: 'Diferente como?', reply: 'Sei lá, me faz rir de verdade. E isso é raro aqui.', aff: 10 },
        { text: 'Se eu sou diferente, que tal a gente ir pra suíte?', reply: 'Haha! Direto ao ponto! Olha, se continuar assim... talvez!', aff: 8 },
      ],
    },
    {
      line: 'Olha, eu NUNCA peço isso, mas... me dá uma gorjeta e eu danço só pra você. Hehe.',
      options: [
        { text: 'Haha, toma. Mas capricha na dança!', reply: 'Combinado! Mas vai ter que ir pra suíte pra ver o show completo...', aff: 15 },
        { text: 'Gorjeta? Haha, negociante.', reply: 'Hehe, aprendi com os melhores! Mas é sério, vai valer a pena!', aff: 8 },
        { text: 'Não precisa de gorjeta, dança de graça.', reply: 'Ah, espertinho! Tá bom, danço. Mas a suíte é paga, hein!', aff: 4 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: 'Olha, vou ser sincera: quero ir pra suíte contigo. Lá é onde a noite fica boa de verdade.',
      options: [
        { text: 'Vou reservar agora!', reply: 'SIIIM! Vai logo! Te espero dançando!', aff: 18 },
        { text: 'Haha, ansiosa?', reply: 'MUITO! Haha! Vai logo antes que eu mude de ideia! Brincadeira, não mudo.', aff: 12 },
        { text: 'O que rola lá?', reply: 'Dança privada, champagne, jacuzzi... e muita risada. Comigo tudo é mais divertido!', aff: 10 },
      ],
    },
    {
      line: 'Ei, já pensou na gente na jacuzzi com champagne? Porque eu já.',
      options: [
        { text: 'Bora agora. Me convenceu.', reply: 'Ebaaa! Melhor decisão da noite! Vamos!', aff: 18 },
        { text: 'Hm, pinta um quadro bem bom.', reply: 'Né?! E na real é melhor do que eu tô descrevendo. Vem!', aff: 14 },
        { text: 'Calma que a noite é longa.', reply: 'Tá bom! Mas não me faz esperar muito, que eu fico inquieta!', aff: 6 },
      ],
    },
  ],
  inviteAccept: 'BORA! Haha, já tô indo! Não começa a festa sem mim!',
  inviteTease: 'Haha, quaaase! Me diverte mais um pouco que eu vou!',
  roomGreet: [
    'UAAAU olha essa suíte! A jacuzzi! Bora!',
    'Haha, finalmente! Bora curtir!',
    'Ei, fecha a porta! A diversão é só nossa agora! Hehe!',
  ],
  roomRounds: [
    {
      line: 'Mano, pede a dança privada! Juro que cê não vai se arrepender!',
      options: [
        { text: 'Bora! Pede aí!', reply: 'É no painel! Vai vai vai! Haha!', aff: 12 },
        { text: 'Calma, vamos curtir o momento.', reply: 'Tá bom, tá bom. Mas não esquece da dança, hein!', aff: 6 },
        { text: 'Quero ver o show completo.', reply: 'Ooooh! Ambicioso! Gostei! Pede o champagne também!', aff: 14 },
      ],
    },
    {
      line: 'Cadê o champagne? Uma noite dessas sem champagne não é noite!',
      options: [
        { text: 'Já pedi! Vem brindar!', reply: 'Yaaay! Saúde pra gente! Essa noite tá incrível!', aff: 12 },
        { text: 'Calma que já vai.', reply: 'Haha, tô ansiosa! Desculpa!', aff: 4 },
        { text: 'Não quero beber mais.', reply: 'Ah, sem graça! Brincadeira. Vamos fazer outra coisa então!', aff: 2 },
      ],
    },
  ],
};

// ================================================================ Bianca — Fala pouco, cobra caro, intriga
const BIANCA: PersonalityData = {
  greetLow: [
    '...Oi.',
    'Hm. Você me olhou antes de vir. Reparei.',
    'Coragem de vir falar. Pode continuar.',
  ],
  greetMid: [
    'Voltou. Achei que ia demorar mais.',
    'Olha quem é. O curioso.',
    'Senta. Mas fala pouco.',
  ],
  greetHigh: [
    'Tava te esperando.',
    'Hm. Você me deixa inquieta. No bom sentido.',
    'Chega mais.',
  ],
  roundsLow: [
    {
      line: '...Sabe o que eu gosto? Silêncio. Mas se for pra quebrar, que seja com um drink na mão.',
      options: [
        { text: 'Vou pedir um pra você.', reply: '...Boa. Talvez a gente se entenda.', aff: 12 },
        { text: 'Prefiro conversa a drink.', reply: '...Conversa sem drink é interrogatório. Pensa nisso.', aff: 2 },
        { text: 'Tá. Silêncio então.', reply: '...*meio sorriso* Esperto. Poucos fazem isso.', aff: 10 },
      ],
    },
    {
      line: 'As pessoas aqui falam demais. Dizem tudo, mostram nada.',
      options: [
        { text: 'Eu prefiro mostrar. Me dá uma chance.', reply: '...Vou ficar de olho. Mostra então.', aff: 12 },
        { text: 'E você? Mostra alguma coisa?', reply: '...Só pra quem merece. Veremos.', aff: 8 },
        { text: 'Ui, durona.', reply: '...Não é durona. É filtro. Funciona melhor do que sorriso.', aff: -5 },
      ],
    },
    {
      line: 'Já viu a suíte lá atrás? Poucos merecem ir comigo. Mas existem.',
      options: [
        { text: 'O que eu preciso fazer pra merecer?', reply: '...Paciência. Atenção. E uma gorjeta não faz mal.', aff: 10 },
        { text: 'Suíte? Com você deve ser interessante.', reply: '...Interessante é pouco. Mas calma.', aff: 8 },
        { text: 'Tá se achando, hein.', reply: '...Não me acho. Me conheço. É diferente.', aff: -6 },
      ],
    },
  ],
  roundsMid: [
    {
      line: '...Me dá uma gorjeta. Não porque eu peça. Porque quero ver se você entende o gesto.',
      options: [
        { text: '*dá a gorjeta sem dizer nada*', reply: '...*pega, olha nos seus olhos* ...Entendeu. Poucos entendem.', aff: 18 },
        { text: 'Pra quê gorjeta?', reply: '...Se precisa perguntar, não entendeu.', aff: -2 },
        { text: 'Toma. E me conta mais sobre você.', reply: '...Talvez. Vamos ver se merece.', aff: 10 },
      ],
    },
    {
      line: 'Eu tenho um caderno. Anoto tudo sobre as pessoas. Você já está nele.',
      options: [
        { text: 'O que anotou?', reply: '"Não desiste fácil. Ouve. Pode valer a pena." ...Pode.', aff: 14 },
        { text: 'Assustador. Mas fascinante.', reply: '...Fascínio e medo andam juntos. Aguenta?', aff: 10 },
        { text: 'Posso ler?', reply: '...Não. Mas posso contar. Se a gente for pra um lugar mais reservado.', aff: 12 },
      ],
    },
    {
      line: '...Faz tempo que ninguém me faz querer sair daqui. Mas a suíte me chamou agora.',
      options: [
        { text: 'Vamos então.', reply: '...Talvez. Mas me convence mais um pouco.', aff: 12 },
        { text: 'Suíte com você deve ser silenciosamente incrível.', reply: '...*quase sorri* ...Você me pega de jeito.', aff: 15 },
        { text: 'O que te faria ir?', reply: '...Certeza. E uma reserva. Nessa ordem.', aff: 10 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: '...Reserva a suíte. Agora. Sem perguntar, sem enrolar.',
      options: [
        { text: '*vai ao terminal e reserva*', reply: '...*pega sua mão* Vamos.', aff: 18 },
        { text: 'Já ia fazer isso.', reply: '...Bom. Vai.', aff: 14 },
        { text: 'Calma, ainda tô—', reply: '...Calma é pra quem não sabe o que quer. Você sabe.', aff: 8 },
      ],
    },
    {
      line: '...Quero ficar a sós. Com você. Sem barulho.',
      options: [
        { text: 'Vem. A suíte é nossa.', reply: '...*levanta e caminha* Leva.', aff: 18 },
        { text: 'Eu também quero.', reply: '...Então para de falar e faz.', aff: 12 },
        { text: 'Achei que nunca ia pedir.', reply: '...Eu não peço. Eu espero. E você passou.', aff: 14 },
      ],
    },
  ],
  inviteAccept: '...Sim. *caminha em direção à suíte sem dizer mais nada*',
  inviteTease: '...Ainda não. Continue. Tô quase.',
  roomGreet: [
    '...Silêncio. Finalmente.',
    'Aqui dá pra ouvir o que importa.',
    '...Fecha a porta.',
  ],
  roomRounds: [
    {
      line: '...A dança privada. Pede. Quero que me veja dançar de verdade.',
      options: [
        { text: 'Pedi.', reply: '...*começa devagar* Olha pra mim.', aff: 15 },
        { text: 'Dança?', reply: '...Eu danço diferente quando é só pra uma pessoa. Pede.', aff: 10 },
        { text: 'Prefiro conversa.', reply: '...As palavras acabam. O corpo fala melhor. Mas tá.', aff: 4 },
      ],
    },
    {
      line: '...Pede o champagne. Não porque eu peço. Porque combina com a noite.',
      options: [
        { text: '*pede sem falar*', reply: '...*brinda em silêncio, olhando nos seus olhos*', aff: 16 },
        { text: 'Tá. Champagne então.', reply: '...Boa escolha.', aff: 10 },
        { text: 'Não quero beber.', reply: '...Tá. Então vem pra água.', aff: 4 },
      ],
    },
  ],
};

// ================================================================ Luna — Calorosa, puxa pela emoção
const LUNA: PersonalityData = {
  greetLow: [
    'Oi! Que bom que veio falar comigo! Ninguém aqui repara em mim, haha.',
    'Eii! Você tava na pista, né? Vi você lá!',
    'Oi oi! Tô feliz hoje. Bora conversar?',
  ],
  greetMid: [
    'Ei, que bom te ver! Tava sentindo sua falta, juro!',
    'Ah, voltou! Meu dia melhorou!',
    'Oii! Pede um drink pra gente, vai!',
  ],
  greetHigh: [
    'Amor! Achei que não vinha mais! Vem cá!',
    'Ai, cheguei toda animada porque sabia que ia te ver!',
    'Oi lindo! A noite começou agora!',
  ],
  roundsLow: [
    {
      line: 'Ei, me paga um drink? É que conversar de boca seca é ruim demais!',
      options: [
        { text: 'Claro! O que quer?', reply: 'Ai obrigada! Pede qualquer coisa doce! Você é um anjo!', aff: 12 },
        { text: 'Tá cedo pra beber, não?', reply: 'Nunca é cedo pra celebrar! Haha! Vai, pede!', aff: 5 },
        { text: 'Depois. Vamos conversar primeiro.', reply: 'Ah, tá bom. Mas lembra depois, hein? Haha!', aff: 3 },
      ],
    },
    {
      line: 'Eu comecei a dançar com 5 anos, sabia? É minha vida.',
      options: [
        { text: 'Dá pra ver. Você se move de um jeito lindo.', reply: 'Ai para! Haha! ...Continua, gostei!', aff: 14 },
        { text: 'Nossa, 5 anos? Que legal.', reply: 'Pois é! Se quiser, danço pra você. Mas não aqui. Na suíte.', aff: 10 },
        { text: 'Dança é só hobby?', reply: 'Hobby?! Minha VIDA! Haha! Mas tá perdoado, já já te mostro.', aff: 4 },
      ],
    },
    {
      line: 'Sabe o que eu queria? Que alguém me notasse de verdade. Não só o corpo, sabe?',
      options: [
        { text: 'Eu noto. Você tem uma energia incrível.', reply: '*olhos brilham* ...Sério? Obrigada. Ninguém fala isso.', aff: 16 },
        { text: 'Eu reparo no todo.', reply: 'Que bonito. Gostei de você.', aff: 10 },
        { text: 'Hm, é uma cantada?', reply: 'Haha! Não! Mas se fosse, funcionou? Brincadeira!', aff: 4 },
      ],
    },
  ],
  roundsMid: [
    {
      line: 'Ei, me dá uma gorjeta? Não pelo dinheiro, é que me sinto especial quando fazem isso.',
      options: [
        { text: 'Toma. Você é especial mesmo.', reply: '*abraça* Ai obrigada! Que fofo! Preciso te recompensar. Já sei como.', aff: 16 },
        { text: 'Gorjeta? Hm.', reply: 'É só um gesto, boba. Mas se não quiser, tudo bem...', aff: 2 },
        { text: 'Toma, mas me deve uma dança.', reply: 'Combinado! Mas a melhor dança é na suíte. Fica a dica!', aff: 12 },
      ],
    },
    {
      line: 'Já imaginou a gente na suíte? Eu dançando pra você, jacuzzi, sem pressa...',
      options: [
        { text: 'Tô imaginando. E gostando.', reply: 'Né?! Então faz acontecer! Reserva pra gente!', aff: 14 },
        { text: 'Haha, pintou um quadro bonito.', reply: 'E olha que a realidade é melhor! Vem!', aff: 10 },
        { text: 'Calma que a noite é longa.', reply: 'Tá bom, mas não demora! Meu coração tá ansioso! Haha!', aff: 5 },
      ],
    },
    {
      line: 'Olha, eu gosto de você de verdade. Me leva pra suíte? Vai ser especial, prometo.',
      options: [
        { text: 'Vou reservar agora.', reply: 'SIM! Obrigada! Vai ser a melhor noite, juro!', aff: 18 },
        { text: 'Já já. Mais um drink antes.', reply: 'Tá bom, pede! Mas bora logo, tô ansiosa! Haha!', aff: 8 },
        { text: 'Hm, acho que ainda é cedo.', reply: 'Ah... tá bom. Mas não me esquece, tá?', aff: 0 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: 'Ei. Me leva. Agora. Não quero perder mais tempo aqui. Quero ficar com você.',
      options: [
        { text: 'Vamos. Tô pronto.', reply: '*pega sua mão* Bora! A noite é nossa!', aff: 20 },
        { text: 'Calma, respira. Haha.', reply: 'Não dá pra ter calma! Haha! Vem logo!', aff: 10 },
        { text: 'Fala mais do que rola lá.', reply: 'Dança, champagne, jacuzzi, conversa no pé do ouvido... Precisa de mais?', aff: 12 },
      ],
    },
    {
      line: 'Se eu fechar os olhos e pedir pra você me levar pra suíte... você leva?',
      options: [
        { text: 'Fecha. Eu te levo.', reply: '*fecha os olhos e sorri* ...Vamos.', aff: 20 },
        { text: 'Sim. Sem pensar duas vezes.', reply: 'Ai... obrigada. Vem.', aff: 16 },
        { text: 'Depende. O que tem lá pra gente?', reply: 'Tudo que você quiser. E eu. Bora.', aff: 12 },
      ],
    },
  ],
  inviteAccept: 'SIM! Já vou! *sai praticamente dançando*',
  inviteTease: 'Quaaase! Me faz sentir mais especial e eu vou!',
  roomGreet: [
    'Ai que lindo esse lugar! Olha a jacuzzi! Bora!',
    'Finalmente a sós! Vem cá!',
    'Fecha a porta! A noite é nossa agora!',
  ],
  roomRounds: [
    {
      line: 'Vem, dança comigo aqui. Sem ninguém olhando. Só a gente.',
      options: [
        { text: '*começa a dançar com ela*', reply: '*encosta em você* ...Perfeito. Não para.', aff: 16 },
        { text: 'Pede a dança privada no painel.', reply: 'Ooh! Profissional! Tá, pede lá! Vai ser incrível!', aff: 12 },
        { text: 'Prefiro ficar sentado te olhando.', reply: 'Ah não! Vem! Preciso de você perto!', aff: 6 },
      ],
    },
    {
      line: 'Pede champagne? Quero brindar a gente. Essa noite merece.',
      options: [
        { text: 'Já pedi. Brinda comigo.', reply: '*brinda* Saúde pra gente! Essa noite tá perfeita!', aff: 14 },
        { text: 'Vem pra jacuzzi primeiro.', reply: 'Ooh! Sim! Vamos!', aff: 12 },
        { text: 'Já bebemos bastante.', reply: 'Ah, tá bom. Então vem cá que eu tenho outra ideia.', aff: 4 },
      ],
    },
  ],
};

// ================================================================ Motor de diálogo

const DATA: Record<string, PersonalityData> = {
  Valentina: VALENTINA,
  Yasmin: YASMIN,
  Bianca: BIANCA,
  Luna: LUNA,
};

export interface DialogueState {
  hostessName: string;
  affinity: number;
  round: DialogueRound | null;
  greeting: string;
  history: Array<{ speaker: 'hostess' | 'player'; text: string }>;
  usedIndices: Set<number>;
  inRoom: boolean;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function tierRounds(data: PersonalityData, aff: number, inRoom: boolean): DialogueRound[] {
  if (inRoom) return data.roomRounds;
  if (aff >= 60) return [...data.roundsMid, ...data.roundsHigh];
  if (aff >= 30) return [...data.roundsLow, ...data.roundsMid];
  return data.roundsLow;
}

export function startDialogue(hostessName: string, affinity: number, inRoom: boolean): DialogueState | null {
  const data = DATA[hostessName];
  if (!data) return null;
  const pool = inRoom ? data.roomGreet : affinity >= 60 ? data.greetHigh : affinity >= 30 ? data.greetMid : data.greetLow;
  const greeting = pick(pool);
  const state: DialogueState = { hostessName, affinity, round: null, greeting, history: [], usedIndices: new Set(), inRoom };
  state.history.push({ speaker: 'hostess', text: greeting });
  nextRound(state);
  return state;
}

export function nextRound(state: DialogueState): boolean {
  const data = DATA[state.hostessName];
  if (!data) return false;
  const pool = tierRounds(data, state.affinity, state.inRoom);
  const available = pool.filter((_, i) => !state.usedIndices.has(i));
  if (available.length === 0) {
    state.usedIndices.clear();
    const retry = pool.filter((_, i) => !state.usedIndices.has(i));
    if (retry.length === 0) return false;
    const idx = Math.floor(Math.random() * retry.length);
    state.round = retry[idx];
    state.usedIndices.add(pool.indexOf(retry[idx]));
    return true;
  }
  const idx = Math.floor(Math.random() * available.length);
  state.round = available[idx];
  state.usedIndices.add(pool.indexOf(available[idx]));
  return true;
}

export function chooseOption(state: DialogueState, optionIdx: number): { affinityDelta: number; reply: string } {
  if (!state.round || optionIdx < 0 || optionIdx >= state.round.options.length) {
    return { affinityDelta: 0, reply: '...' };
  }
  const opt = state.round.options[optionIdx];
  state.history.push({ speaker: 'player', text: opt.text });
  state.history.push({ speaker: 'hostess', text: opt.reply });
  state.affinity = Math.max(0, Math.min(100, state.affinity + opt.aff));
  return { affinityDelta: opt.aff, reply: opt.reply };
}

export function getInviteResponse(hostessName: string, affinity: number): { accept: boolean; text: string } {
  const data = DATA[hostessName];
  if (!data) return { accept: false, text: '...' };
  if (affinity >= 60) return { accept: true, text: data.inviteAccept };
  return { accept: false, text: data.inviteTease };
}

export function hasPersonality(name: string): boolean {
  return name in DATA;
}
