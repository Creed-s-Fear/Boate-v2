/**
 * Hostess dialogue system. Each one has her own personality
 * and actively encourages the player to spend (drinks, tips, suite).
 * Runs entirely on the client (no server, no external AI).
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

// ================================================================ Valentina — Sophisticated, knows her worth
const VALENTINA: PersonalityData = {
  greetLow: [
    'Hi. Are you going to stare at me from across the room all night?',
    'Hm, at least you came to talk. Most guys just stand there gawking.',
    'Good evening. I could use some company — if it\'s good company.',
  ],
  greetMid: [
    'Oh, you\'re back. I was starting to think you gave up on me.',
    'Hello again. Did you bring champagne this time, or just conversation?',
    'Hey. Sit here — I was running out of interesting people.',
  ],
  greetHigh: [
    'Finally. The night was dragging without you.',
    'Come, I saved you a spot next to me.',
    'Hey, handsome. I thought you weren\'t coming.',
  ],
  roundsLow: [
    {
      line: 'You know what I like in a man? Confidence. Come here and buy me a drink.',
      options: [
        { text: 'Done. What are you having?', reply: 'Hm, I like that. Get me a Peekhole. And get one for yourself too.', aff: 10 },
        { text: 'Easy, I don\'t even know you yet.', reply: 'True, but if you want to get to know me, start by investing, right?', aff: -2 },
        { text: 'Why a drink? Isn\'t my company enough?', reply: 'Cute, but in this house we toast before we talk.', aff: 3 },
      ],
    },
    {
      line: 'I\'m demanding, fair warning. But whoever passes my filter doesn\'t regret it.',
      options: [
        { text: 'I like a challenge.', reply: 'Good. Then show me you\'re different from these other guys.', aff: 10 },
        { text: 'Demanding how? What wins you over?', reply: 'Generosity, attention, and knowing when to shut up. In that order.', aff: 8 },
        { text: 'Ooh, full of yourself.', reply: 'Darling, it\'s not vanity. It\'s standards. They work.', aff: -6 },
      ],
    },
    {
      line: 'See those private rooms over there? Some people book them just for privacy with me.',
      options: [
        { text: 'How do you book one?', reply: 'At Livia\'s terminal. But first, convince me you\'re worth my time.', aff: 8 },
        { text: 'Must be expensive.', reply: 'It is. But the good things are. You seem to understand that.', aff: 6 },
        { text: 'Hm, interesting. Is it worth it?', reply: 'If I\'m into the person? Worth every penny.', aff: 10 },
      ],
    },
  ],
  roundsMid: [
    {
      line: 'Hey, I\'m thirsty. Buy me another drink? The conversation flows better that way.',
      options: [
        { text: 'Sure, I\'ll order one.', reply: 'That\'s what I like. Practical and generous.', aff: 12 },
        { text: 'Another one? I already paid for one.', reply: 'So? The night is long, darling.', aff: -3 },
        { text: 'Only if it comes with a dance later.', reply: 'Hm, negotiating with me? Fine, deal. But the drink comes first.', aff: 8 },
      ],
    },
    {
      line: 'You know, I was thinking... it\'s been a while since I went to the suite with someone worthwhile.',
      options: [
        { text: 'Is that a hint?', reply: 'I\'m just saying that if someone invited me... maybe I\'d say yes. Maybe.', aff: 14 },
        { text: 'I can change that. Give me a chance.', reply: 'Hmm. I like the confidence. Keep it up.', aff: 12 },
        { text: 'Must be a long line.', reply: 'There is. But I choose who gets in. And I\'m looking at you.', aff: 10 },
      ],
    },
    {
      line: 'I\'ll be honest: give me a good tip and I\'ll tell you a secret.',
      options: [
        { text: 'Done. Here you go.', reply: 'The secret: I want to go to the suite with you. There, I said it.', aff: 15 },
        { text: 'A secret? What kind?', reply: 'The kind that makes you want to take me upstairs.', aff: 10 },
        { text: 'I don\'t pay for secrets.', reply: 'Fine, I\'ll keep it to myself. But you would\'ve liked hearing it.', aff: -4 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: 'Enough stalling. Book the suite and take me there. I\'m ready.',
      options: [
        { text: 'I\'ll book it now.', reply: 'Good. I\'ll be waiting. Don\'t take long.', aff: 15 },
        { text: 'Easy, let\'s enjoy ourselves here a bit more.', reply: 'Fine, but don\'t keep me waiting too long. My patience has limits.', aff: 5 },
        { text: 'Ready for what, exactly?', reply: 'For everything you have the courage to do. Shall we?', aff: 12 },
      ],
    },
    {
      line: 'Want to know what the suite is like with me? Invite me and find out.',
      options: [
        { text: 'I\'m convinced. Let\'s go.', reply: 'Finally. Let\'s go.', aff: 18 },
        { text: 'Tell me more, I\'m almost there.', reply: 'Private dance, champagne, jacuzzi... and me. Need more?', aff: 12 },
        { text: 'Must be really good.', reply: 'Darling, "good" is an understatement. But you\'ll only know if you go.', aff: 10 },
      ],
    },
  ],
  inviteAccept: 'Deal. I\'ll meet you there. Bring champagne.',
  inviteTease: 'Almost. But I need more attention first. Keep trying.',
  roomGreet: [
    'Hm, nice suite. Good choice on the lighting.',
    'Finally alone. Lock the door.',
    'That jacuzzi is calling me. Coming?',
  ],
  roomRounds: [
    {
      line: 'Relax. It\'s just us here. Want to order a private dance?',
      options: [
        { text: 'Yes. Dance for me.', reply: 'Hm. Use the panel over there, and I\'ll start.', aff: 12 },
        { text: 'I\'d rather just talk.', reply: 'Fine, but don\'t miss your chance. My dancing is special.', aff: 6 },
        { text: 'I want everything you\'ve got.', reply: 'Ambitious. I like it. One thing at a time.', aff: 10 },
      ],
    },
    {
      line: 'Order us some champagne. The night gets better with it.',
      options: [
        { text: 'I\'ll order it now.', reply: 'That\'s the way. Toast with me.', aff: 12 },
        { text: 'Again? We already drank.', reply: 'So? The bottle doesn\'t refill itself, love.', aff: -2 },
        { text: 'Only in the jacuzzi.', reply: 'Ooh. I love that idea. Let\'s go.', aff: 14 },
      ],
    },
  ],
};

// ================================================================ Yasmin — Fun-loving, wraps you up in laughter
const YASMIN: PersonalityData = {
  greetLow: [
    'Heyyy, what\'s up! I was watching you from over there. Wanna chat?',
    'Hi hi! I thought you were gonna hide in a corner all night. Glad you came!',
    'Hey! Having fun? This music is sooo good, right?',
  ],
  greetMid: [
    'You\'re back! Haha, I knew it!',
    'Hey, there you go! I thought you ran away from me.',
    'Yaaay! My favorite person is here! Get me a drink!',
  ],
  greetHigh: [
    'OH, hi! I missed you! Come come come!',
    'Finally! I was dying of boredom without you!',
    'I\'m already hyped up, come on over!',
  ],
  roundsLow: [
    {
      line: 'Hey, buy me a drink? I promise I\'m funnier after that. Kidding. Or not.',
      options: [
        { text: 'Haha, let\'s go! Get whatever you want.', reply: 'Yaaay! Order two, drinking alone is sad! Haha!', aff: 12 },
        { text: 'Trying to drain my wallet, huh?', reply: 'What! It\'s just one little drink! You can decide about the second one later. Hehe.', aff: 5 },
        { text: 'No, thanks.', reply: 'Aw, boring. Okay, let\'s just talk then. But know that I drink better than I talk.', aff: -3 },
      ],
    },
    {
      line: 'Do you dance? Because if you don\'t dance with me, you don\'t deserve me. House rules.',
      options: [
        { text: 'I\'m a terrible dancer, but I\'ll try!', reply: 'That\'s the spirit! Nobody cares if you dance badly, they care if you don\'t try! Let\'s go!', aff: 14 },
        { text: 'Dance? I\'d rather sit down.', reply: 'Oh no, how lazy! I\'m gonna drag you out there. Don\'t say I didn\'t warn you.', aff: 2 },
        { text: 'I only dance up close.', reply: 'Hahaha! Slow down! Win me over first!', aff: 8 },
      ],
    },
    {
      line: 'Did you know there\'s a suite in the back? With a jacuzzi and everything. Been there?',
      options: [
        { text: 'Not yet. Take me?', reply: 'Haha, hold on! First we get to know each other, then I\'ll think about it. Buy me a drink.', aff: 8 },
        { text: 'I\'ve heard about it. They say it\'s amazing.', reply: 'It IS. And with me in there it\'s even better, if I do say so myself. Hehe.', aff: 10 },
        { text: 'Suite? I\'m good here.', reply: 'Suit yourself! But if you change your mind, I\'m right here.', aff: 3 },
      ],
    },
  ],
  roundsMid: [
    {
      line: 'Hey, I\'m thirsty again! Buy me another? This conversation is too good to stop.',
      options: [
        { text: 'Let\'s go! Another round for us!', reply: 'Yaaay! You\'re the best! Cheers!', aff: 12 },
        { text: 'I already bought one, come on.', reply: 'And you\'re keeping count? Haha! Okay, I\'ll drink water. Kidding, just buy it!', aff: 2 },
        { text: 'I\'ll pay, but you owe me a dance.', reply: 'Deal! Dance + drink = perfect night!', aff: 10 },
      ],
    },
    {
      line: 'You seem genuinely cool. Most guys here are kinda... I dunno. You\'re different.',
      options: [
        { text: 'Thanks. You\'re special too.', reply: 'Awww! Stop! Haha! ...Keep going, I liked that!', aff: 12 },
        { text: 'Different how?', reply: 'I dunno, you make me laugh for real. And that\'s rare here.', aff: 10 },
        { text: 'If I\'m different, how about we hit the suite?', reply: 'Haha! Straight to the point! Look, if you keep this up... maybe!', aff: 8 },
      ],
    },
    {
      line: 'Look, I NEVER ask this, but... give me a tip and I\'ll dance just for you. Hehe.',
      options: [
        { text: 'Haha, here. But make that dance count!', reply: 'Deal! But you\'ll have to come to the suite for the full show...', aff: 15 },
        { text: 'A tip? Haha, smooth negotiator.', reply: 'Hehe, learned from the best! But seriously, it\'ll be worth it!', aff: 8 },
        { text: 'You don\'t need a tip, dance for free.', reply: 'Oh, clever! Fine, I\'ll dance. But the suite costs extra!', aff: 4 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: 'Look, I\'ll be real: I wanna go to the suite with you. That\'s where the night really gets good.',
      options: [
        { text: 'I\'ll book it now!', reply: 'YESSS! Hurry! I\'ll be here dancing while I wait!', aff: 18 },
        { text: 'Haha, eager much?', reply: 'SO much! Haha! Hurry before I change my mind! Kidding, I won\'t.', aff: 12 },
        { text: 'What goes on there?', reply: 'Private dance, champagne, jacuzzi... and lots of fun. Everything\'s more fun with me!', aff: 10 },
      ],
    },
    {
      line: 'Hey, have you pictured us in the jacuzzi with champagne? Because I have.',
      options: [
        { text: 'Let\'s go now. You convinced me.', reply: 'Yaaay! Best decision of the night! Let\'s go!', aff: 18 },
        { text: 'Hm, that paints a pretty nice picture.', reply: 'Right?! And honestly it\'s even better than I\'m describing. Come on!', aff: 14 },
        { text: 'Easy, the night is still young.', reply: 'Okay! But don\'t make me wait too long, I get restless!', aff: 6 },
      ],
    },
  ],
  inviteAccept: 'LET\'S GO! Haha, I\'m already on my way! Don\'t start the party without me!',
  inviteTease: 'Haha, almooost! Entertain me a little more and I\'m in!',
  roomGreet: [
    'WOOOW look at this suite! The jacuzzi! Let\'s go!',
    'Haha, finally! Let\'s have some fun!',
    'Hey, close the door! The fun is all ours now! Hehe!',
  ],
  roomRounds: [
    {
      line: 'Dude, order the private dance! I swear you won\'t regret it!',
      options: [
        { text: 'Let\'s do it! Order it!', reply: 'It\'s on the panel! Go go go! Haha!', aff: 12 },
        { text: 'Relax, let\'s enjoy the moment.', reply: 'Okay, okay. But don\'t forget about the dance!', aff: 6 },
        { text: 'I want the full show.', reply: 'Ooooh! Ambitious! Love it! Order the champagne too!', aff: 14 },
      ],
    },
    {
      line: 'Where\'s the champagne? A night like this without champagne isn\'t a night!',
      options: [
        { text: 'Already ordered! Come toast!', reply: 'Yaaay! Cheers to us! This night is incredible!', aff: 12 },
        { text: 'Relax, it\'s coming.', reply: 'Haha, I\'m so excited! Sorry!', aff: 4 },
        { text: 'I don\'t want to drink anymore.', reply: 'Aw, boring! Kidding. Let\'s do something else then!', aff: 2 },
      ],
    },
  ],
};

// ================================================================ Bianca — Few words, high price, intriguing
const BIANCA: PersonalityData = {
  greetLow: [
    '...Hi.',
    'Hm. You looked at me before coming over. I noticed.',
    'Brave of you to come talk. Go on.',
  ],
  greetMid: [
    'You\'re back. I thought it would take longer.',
    'Look who it is. The curious one.',
    'Sit. But keep it short.',
  ],
  greetHigh: [
    'I was waiting for you.',
    'Hm. You make me restless. In a good way.',
    'Come closer.',
  ],
  roundsLow: [
    {
      line: '...You know what I like? Silence. But if you\'re going to break it, do it with a drink in hand.',
      options: [
        { text: 'I\'ll get you one.', reply: '...Good. Maybe we\'ll get along.', aff: 12 },
        { text: 'I prefer conversation over drinks.', reply: '...Conversation without a drink is an interrogation. Think about it.', aff: 2 },
        { text: 'Fine. Silence it is.', reply: '...*half smile* Smart. Few people do that.', aff: 10 },
      ],
    },
    {
      line: 'People here talk too much. Say everything, show nothing.',
      options: [
        { text: 'I prefer to show. Give me a chance.', reply: '...I\'ll be watching. Show me then.', aff: 12 },
        { text: 'And you? Do you show anything?', reply: '...Only to those who deserve it. We\'ll see.', aff: 8 },
        { text: 'Ooh, tough girl.', reply: '...Not tough. Selective. Works better than a smile.', aff: -5 },
      ],
    },
    {
      line: 'Ever seen the suite in the back? Few people deserve to go there with me. But they exist.',
      options: [
        { text: 'What do I need to do to deserve it?', reply: '...Patience. Attention. And a tip doesn\'t hurt.', aff: 10 },
        { text: 'Suite? With you it must be interesting.', reply: '...Interesting is an understatement. But patience.', aff: 8 },
        { text: 'Think highly of yourself, don\'t you.', reply: '...I don\'t think highly. I know myself. There\'s a difference.', aff: -6 },
      ],
    },
  ],
  roundsMid: [
    {
      line: '...Give me a tip. Not because I\'m asking. Because I want to see if you understand the gesture.',
      options: [
        { text: '*hands the tip without a word*', reply: '...*takes it, looks into your eyes* ...You understood. Few do.', aff: 18 },
        { text: 'What\'s the tip for?', reply: '...If you have to ask, you don\'t understand.', aff: -2 },
        { text: 'Here. And tell me more about yourself.', reply: '...Maybe. Let\'s see if you deserve it.', aff: 10 },
      ],
    },
    {
      line: 'I keep a notebook. I write everything about people. You\'re already in it.',
      options: [
        { text: 'What did you write?', reply: '"Doesn\'t give up easily. Listens. Could be worth it." ...Could be.', aff: 14 },
        { text: 'Creepy. But fascinating.', reply: '...Fascination and fear go hand in hand. Can you handle it?', aff: 10 },
        { text: 'Can I read it?', reply: '...No. But I could tell you. If we go somewhere more private.', aff: 12 },
      ],
    },
    {
      line: '...It\'s been a while since anyone made me want to leave this spot. But the suite just called.',
      options: [
        { text: 'Then let\'s go.', reply: '...Maybe. But convince me a little more.', aff: 12 },
        { text: 'The suite with you must be quietly incredible.', reply: '...*almost smiles* ...You really get to me.', aff: 15 },
        { text: 'What would make you go?', reply: '...Certainty. And a reservation. In that order.', aff: 10 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: '...Book the suite. Now. No questions, no stalling.',
      options: [
        { text: '*goes to the terminal and books it*', reply: '...*takes your hand* Let\'s go.', aff: 18 },
        { text: 'I was just about to.', reply: '...Good. Go.', aff: 14 },
        { text: 'Hold on, I\'m still—', reply: '...Hesitation is for people who don\'t know what they want. You know.', aff: 8 },
      ],
    },
    {
      line: '...I want to be alone. With you. No noise.',
      options: [
        { text: 'Come. The suite is ours.', reply: '...*stands and walks* Lead the way.', aff: 18 },
        { text: 'I want that too.', reply: '...Then stop talking and do it.', aff: 12 },
        { text: 'I thought you\'d never ask.', reply: '...I don\'t ask. I wait. And you passed.', aff: 14 },
      ],
    },
  ],
  inviteAccept: '...Yes. *walks toward the suite without another word*',
  inviteTease: '...Not yet. Keep going. I\'m almost there.',
  roomGreet: [
    '...Silence. Finally.',
    'Here you can hear what matters.',
    '...Close the door.',
  ],
  roomRounds: [
    {
      line: '...The private dance. Order it. I want you to see me really dance.',
      options: [
        { text: 'Done.', reply: '...*starts slowly* Look at me.', aff: 15 },
        { text: 'Dance?', reply: '...I dance differently when it\'s just for one person. Order it.', aff: 10 },
        { text: 'I\'d rather talk.', reply: '...Words run out. The body speaks better. But fine.', aff: 4 },
      ],
    },
    {
      line: '...Order the champagne. Not because I\'m asking. Because it suits the night.',
      options: [
        { text: '*orders without speaking*', reply: '...*toasts in silence, looking into your eyes*', aff: 16 },
        { text: 'Fine. Champagne then.', reply: '...Good choice.', aff: 10 },
        { text: 'I don\'t want to drink.', reply: '...Fine. Then come to the water.', aff: 4 },
      ],
    },
  ],
};

// ================================================================ Luna — Warm, pulls at your emotions
const LUNA: PersonalityData = {
  greetLow: [
    'Hi! I\'m so glad you came to talk to me! Nobody notices me here, haha.',
    'Heey! You were on the dance floor, right? I saw you there!',
    'Hi hi! I\'m in such a good mood today. Wanna chat?',
  ],
  greetMid: [
    'Hey, so good to see you! I was missing you, I swear!',
    'Oh, you\'re back! You just made my day!',
    'Hii! Get us a drink, come on!',
  ],
  greetHigh: [
    'Babe! I thought you weren\'t coming! Come here!',
    'Oh, I came in all excited because I knew I\'d see you!',
    'Hey gorgeous! The night just started!',
  ],
  roundsLow: [
    {
      line: 'Hey, buy me a drink? Talking with a dry mouth is the worst!',
      options: [
        { text: 'Of course! What do you want?', reply: 'Aw thank you! Get something sweet! You\'re an angel!', aff: 12 },
        { text: 'Isn\'t it a bit early to drink?', reply: 'It\'s never too early to celebrate! Haha! Go on, order!', aff: 5 },
        { text: 'Later. Let\'s talk first.', reply: 'Okay, fine. But don\'t forget later, okay? Haha!', aff: 3 },
      ],
    },
    {
      line: 'I started dancing when I was 5, did you know? It\'s my life.',
      options: [
        { text: 'You can tell. You move so beautifully.', reply: 'Oh stop! Haha! ...Keep going, I liked that!', aff: 14 },
        { text: 'Wow, 5 years old? That\'s cool.', reply: 'Right?! If you want, I\'ll dance for you. But not here. In the suite.', aff: 10 },
        { text: 'Is dancing just a hobby?', reply: 'Hobby?! My LIFE! Haha! But you\'re forgiven, I\'ll show you soon.', aff: 4 },
      ],
    },
    {
      line: 'You know what I wish? That someone would really notice me. Not just my body, you know?',
      options: [
        { text: 'I notice. You have incredible energy.', reply: '*eyes light up* ...Really? Thank you. Nobody says that.', aff: 16 },
        { text: 'I see the whole picture.', reply: 'That\'s beautiful. I like you.', aff: 10 },
        { text: 'Hm, is that a pickup line?', reply: 'Haha! No! But if it were, did it work? Just kidding!', aff: 4 },
      ],
    },
  ],
  roundsMid: [
    {
      line: 'Hey, give me a tip? Not for the money — it just makes me feel special when people do that.',
      options: [
        { text: 'Here. You really are special.', reply: '*hugs* Aw thank you! That\'s so sweet! I need to make it up to you. I know how.', aff: 16 },
        { text: 'A tip? Hm.', reply: 'It\'s just a gesture, silly. But if you don\'t want to, it\'s fine...', aff: 2 },
        { text: 'Here, but you owe me a dance.', reply: 'Deal! But the best dance is in the suite. Just saying!', aff: 12 },
      ],
    },
    {
      line: 'Have you imagined us in the suite? Me dancing for you, jacuzzi, no rush...',
      options: [
        { text: 'I\'m imagining it. And I like it.', reply: 'Right?! Then make it happen! Book it for us!', aff: 14 },
        { text: 'Haha, you paint a pretty picture.', reply: 'And the reality is even better! Come on!', aff: 10 },
        { text: 'Easy, the night is still young.', reply: 'Okay, but don\'t take too long! My heart\'s racing! Haha!', aff: 5 },
      ],
    },
    {
      line: 'Look, I really like you. Take me to the suite? It\'ll be special, I promise.',
      options: [
        { text: 'I\'ll book it now.', reply: 'YES! Thank you! It\'ll be the best night ever, I swear!', aff: 18 },
        { text: 'In a bit. One more drink first.', reply: 'Okay, order it! But let\'s go soon, I\'m so excited! Haha!', aff: 8 },
        { text: 'Hm, I think it\'s still early.', reply: 'Oh... okay. But don\'t forget about me, okay?', aff: 0 },
      ],
    },
  ],
  roundsHigh: [
    {
      line: 'Hey. Take me. Now. I don\'t want to waste any more time here. I want to be with you.',
      options: [
        { text: 'Let\'s go. I\'m ready.', reply: '*takes your hand* Let\'s go! The night is ours!', aff: 20 },
        { text: 'Easy, breathe. Haha.', reply: 'I can\'t be calm! Haha! Come on, hurry!', aff: 10 },
        { text: 'Tell me more about what goes on there.', reply: 'Dancing, champagne, jacuzzi, whispering in your ear... Need more?', aff: 12 },
      ],
    },
    {
      line: 'If I close my eyes and ask you to take me to the suite... will you?',
      options: [
        { text: 'Close them. I\'ll take you.', reply: '*closes eyes and smiles* ...Let\'s go.', aff: 20 },
        { text: 'Yes. Without a second thought.', reply: 'Oh... thank you. Come.', aff: 16 },
        { text: 'Depends. What\'s waiting for us there?', reply: 'Everything you want. And me. Let\'s go.', aff: 12 },
      ],
    },
  ],
  inviteAccept: 'YES! I\'m on my way! *practically dances out*',
  inviteTease: 'Almooost! Make me feel a little more special and I\'m in!',
  roomGreet: [
    'Oh wow this place is beautiful! Look at the jacuzzi! Let\'s go!',
    'Finally alone! Come here!',
    'Close the door! The night is ours now!',
  ],
  roomRounds: [
    {
      line: 'Come, dance with me here. No one watching. Just us.',
      options: [
        { text: '*starts dancing with her*', reply: '*leans into you* ...Perfect. Don\'t stop.', aff: 16 },
        { text: 'Order the private dance on the panel.', reply: 'Ooh! Professional! Okay, order it! It\'ll be amazing!', aff: 12 },
        { text: 'I\'d rather sit and watch you.', reply: 'No way! Come here! I need you close!', aff: 6 },
      ],
    },
    {
      line: 'Order champagne? I want to toast to us. This night deserves it.',
      options: [
        { text: 'Already ordered. Toast with me.', reply: '*toasts* Cheers to us! This night is perfect!', aff: 14 },
        { text: 'Come to the jacuzzi first.', reply: 'Ooh! Yes! Let\'s go!', aff: 12 },
        { text: 'We\'ve had enough to drink.', reply: 'Okay, fine. Then come here, I\'ve got another idea.', aff: 4 },
      ],
    },
  ],
};

// ================================================================ Dialogue engine

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
