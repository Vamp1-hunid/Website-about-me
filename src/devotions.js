// src/devotions.js
// For each daily verse (src/verses.js): a short devotion, a word of encouragement and a prayer.
// Shown when someone taps the verse at the top of their feed. Written for Chapterhive (original text,
// not copied from any Bible translation), so it can be shown freely.
// [devotion, encouragement, prayer]

const D = {
  "John 3:16": [
    "God's love isn't a reward for getting everything right. It came first, before we did anything, and it was big enough to give everything. You are part of the \"world\" this verse is talking about.",
    "You are loved on your best day and your worst day by the same amount.",
    "Father, thank you for loving me before I ever looked for you. Help me rest in that love today and pass a little of it on to someone else. Amen."
  ],
  "Psalm 23:1": [
    "A shepherd knows each sheep, leads it to food and water, and goes after it when it wanders. David, who was once a shepherd himself, says God looks after us the same way.",
    "Whatever you're short of today, you're not short of a Shepherd.",
    "Lord, be my shepherd today. Lead me where I need to go, and help me trust that you'll provide what I need. Amen."
  ],
  "Philippians 4:13": [
    "Paul wrote this from prison. It isn't a promise that we'll win every game. It means that in plenty or in need, he'd found a strength that didn't come from his circumstances.",
    "You don't have to feel strong to keep going. Strength can be given to you one step at a time.",
    "Jesus, I can't do today on my own. Give me the strength I need for the next step, and the next one after that. Amen."
  ],
  "Jeremiah 29:11": [
    "These words were first spoken to people far from home, who would wait seventy years to return. God's good plans don't always arrive quickly, but they arrive.",
    "A slow season isn't a forgotten one. Your story is still being written.",
    "God, when I can't see where my life is going, help me trust that you can. Give me patience while I wait, and hope while I work. Amen."
  ],
  "Proverbs 3:5-6": [
    "Leaning on your own understanding is like leaning on a wall you're not sure is solid. This verse invites us to put our full weight on God, who sees the whole road.",
    "You don't need every answer today. You need the next right step.",
    "Lord, I bring you the decisions I'm unsure about. Make my path clear, and give me the courage to follow it. Amen."
  ],
  "Isaiah 40:31": [
    "Eagles don't flap hard to stay up; they rest on rising air. Waiting on God is a bit like that: less striving, more trusting the wind that carries you.",
    "Tired is not the same as finished. Rest, and you'll rise again.",
    "Father, I'm tired. Renew my strength today. Teach me to rest in you instead of running on empty. Amen."
  ],
  "Romans 8:28": [
    "This verse doesn't say everything that happens is good. It says God can work in all things, even the painful ones, to bring good out of them for those who love him.",
    "The hard chapter you're in isn't the end of the book.",
    "God, I don't understand everything I'm going through. Please take even this and work it for good in my life. Amen."
  ],
  "Joshua 1:9": [
    "Joshua had huge shoes to fill after Moses. God didn't tell him he was ready; God told him he wouldn't be alone. Courage grows from company, not from certainty.",
    "Be brave today. You're not walking in alone.",
    "Lord, I'm facing things that scare me. Remind me that you're with me wherever I go, and give me courage. Amen."
  ],
  "Matthew 11:28": [
    "Jesus didn't say \"come to me once you've sorted yourself out.\" He invited the weary and burdened exactly as they are, and promised rest.",
    "You're allowed to put the heavy things down for a while.",
    "Jesus, I'm carrying more than I can manage. I bring it all to you now. Give my heart and mind rest. Amen."
  ],
  "Psalm 46:1": [
    "A refuge is somewhere you run when the storm comes. The psalmist says God isn't far away when trouble hits; he's a very present help, right there in it.",
    "Whatever is shaking around you, there is a safe place to stand.",
    "God, be my refuge today. When things feel unstable, help me run to you first. Amen."
  ],
  "2 Timothy 1:7": [
    "Paul reminded young Timothy that fear doesn't come from God. What God gives instead is power to act, love to guide it, and a sound mind to keep us steady.",
    "Fear may speak loudly, but it doesn't get the final word.",
    "Holy Spirit, replace my fear with your power, your love and a calm, clear mind. Amen."
  ],
  "1 Corinthians 13:4-7": [
    "This famous passage reads like a description of how God loves us. It's also a mirror: patient, kind, not keeping score. Love is shown more in what we do than in what we feel.",
    "One kind, patient act today is love in action.",
    "Lord, make my love patient and kind. Help me let go of old scores and love the people around me the way you love me. Amen."
  ],
  "Philippians 4:6-7": [
    "Paul's answer to worry is prayer with thanksgiving: tell God what you need and thank him for what he's already done. The peace that follows doesn't always make sense, and that's the point.",
    "Swap one worry for one prayer today and see what changes.",
    "Father, here are the things on my mind. Thank you for what you've already done for me. Guard my heart and mind with your peace. Amen."
  ],
  "Psalm 119:105": [
    "A lamp in ancient times lit only a few steps ahead, not the whole journey. God's word is often like that: enough light for the next step, not the whole map.",
    "You don't need to see the whole road. Just the next step.",
    "Lord, light up my next step. Help me read your word and walk by it today. Amen."
  ],
  "Galatians 5:22-23": [
    "Fruit isn't forced; it grows when a tree is healthy and connected. Love, joy, peace and the rest grow in us as we stay close to God, little by little.",
    "Growth is quiet. You may be growing more than you can see.",
    "Holy Spirit, grow your fruit in me: love, joy, peace, patience, kindness, goodness, faithfulness, gentleness and self-control. Amen."
  ],
  "Colossians 3:23": [
    "Whatever the task, studying, cooking, drawing, a part-time job, it can be done as an offering to God. That turns ordinary work into something meaningful.",
    "Put your whole heart into today's work. It counts.",
    "Lord, I offer you my work today. Help me do it well and with a good heart, as if I'm doing it for you. Amen."
  ],
  "Romans 12:2": [
    "It's easy to let the world around us shape how we think. Paul invites us to let God renew our minds instead, so that we can recognise what's good and right.",
    "You don't have to fit the mould. You can be renewed.",
    "God, renew my mind today. Help me think in ways that please you, not just in the ways everyone else does. Amen."
  ],
  "Matthew 5:14-16": [
    "Jesus didn't say \"try to become light.\" He said \"you are the light.\" A small lamp in a dark room changes everything; so can one act of goodness.",
    "Someone today needs the light you carry. Let it shine.",
    "Jesus, help me shine today, not to show off, but so others can see your goodness through what I do. Amen."
  ],
  "Psalm 139:14": [
    "David looked at himself and saw careful, wonderful craftsmanship. Before you compare yourself to anyone, remember that you were made on purpose, by a Maker who doesn't make mistakes.",
    "You are not an accident. You're a masterpiece in progress.",
    "Creator God, thank you for making me. Help me see myself the way you see me, and treat others as your handiwork too. Amen."
  ],
  "Isaiah 41:10": [
    "God gives three promises here: I am with you, I will strengthen you, I will hold you up. Fear shrinks when we remember who is holding our hand.",
    "You are held, even when you feel like you're slipping.",
    "Lord, I'm afraid of some things right now. Hold me up, strengthen me, and remind me you're with me. Amen."
  ],
  "Lamentations 3:22-23": [
    "These hopeful lines sit in the middle of a book full of grief. Even on the hardest days, the writer found that God's mercy showed up again each morning.",
    "Today is a fresh start. Yesterday doesn't get to define it.",
    "Faithful God, thank you that your mercies are new this morning. Help me start again with you today. Amen."
  ],
  "Micah 6:8": [
    "People asked what offering would please God. The answer was simple and hard: do what is right, love being kind, and walk humbly with God.",
    "Do the right thing, be kind, stay humble. That's a full day's work.",
    "Lord, help me act justly, love mercy and walk humbly with you today. Amen."
  ],
  "James 1:5": [
    "James says that when we don't know what to do, we can simply ask God, who gives generously and doesn't look down on us for asking.",
    "Not knowing is not failing. Ask.",
    "God, I need wisdom for the choices in front of me. Thank you that you give it generously. Show me what to do. Amen."
  ],
  "Hebrews 11:1": [
    "Faith is trust in what we can't see yet: like planting a seed and watering it before anything shows above the ground.",
    "Keep watering the seed. Things are happening under the soil.",
    "Lord, strengthen my faith. Help me trust you for what I can't see yet. Amen."
  ],
  "Ephesians 2:10": [
    "The word Paul uses for \"workmanship\" is close to \"masterpiece.\" You were made with good things in mind for you to do, prepared before you even started.",
    "There is good work with your name on it today.",
    "God, thank you for making me with a purpose. Open my eyes to the good things you've prepared for me to do. Amen."
  ],
  "Psalm 37:4": [
    "Delighting in God changes what we desire. As we enjoy him, our hearts start wanting the things he wants for us, and those are the desires he loves to fulfil.",
    "Enjoy God today, not just ask him for things.",
    "Lord, help me find my joy in you. Shape my desires so they line up with yours. Amen."
  ],
  "Proverbs 16:3": [
    "Committing your work to God doesn't mean doing nothing. It means doing your part and trusting him with the results.",
    "Plan, work hard, then leave the results in good hands.",
    "Father, I commit my plans and my work to you. Guide them and establish them. Amen."
  ],
  "Matthew 6:33": [
    "Jesus spoke these words to people anxious about food and clothes. Put God and his ways first, he said, and the rest will be taken care of.",
    "Put first things first today, and watch the rest fall into place.",
    "Lord, help me seek you first today, before my worries and my to-do list. Amen."
  ],
  "1 Peter 5:7": [
    "To \"cast\" something is to throw it. Peter invites us to throw our anxieties onto God, because he genuinely cares about us.",
    "You don't have to carry it all. He cares about you.",
    "Lord, I throw my worries onto you now. Thank you that you care about me. Amen."
  ],
  "Psalm 121:1-2": [
    "Pilgrims climbing to Jerusalem sang this song while looking at the hills ahead. Their help didn't come from the hills; it came from the One who made them.",
    "Look up. Help is closer than the problem.",
    "Maker of heaven and earth, be my help today. Watch over my going out and my coming in. Amen."
  ],
  "Romans 15:13": [
    "Paul prays that God would fill us so full of joy and peace that we overflow with hope. Hope isn't wishful thinking here; it's a gift from the Holy Spirit.",
    "Let hope overflow today. Someone near you could use the extra.",
    "God of hope, fill me with joy and peace as I trust you, so that I overflow with hope by the power of your Spirit. Amen."
  ],
  "Zephaniah 3:17": [
    "This verse pictures God singing over his people with joy. Not tolerating them, not putting up with them: rejoicing over them.",
    "Somebody is celebrating you today, even if you can't hear it.",
    "Lord, thank you that you delight in me. Quiet my heart with your love today. Amen."
  ],
  "Ecclesiastes 3:1": [
    "Life has seasons: planting and harvesting, crying and laughing, waiting and moving. Whatever season you're in, it is a season, not forever.",
    "This season has a purpose, and it won't last forever.",
    "God, help me make the most of this season and trust you with the timing of the next one. Amen."
  ],
  "Psalm 34:18": [
    "When our hearts are broken, God doesn't keep his distance. The psalmist says he comes close to those who are hurting.",
    "If your heart is heavy today, you're not alone in it.",
    "Lord, come close to me and to everyone who is hurting today. Heal what is broken. Amen."
  ],
  "John 14:27": [
    "Jesus said these words the night before he died. The peace he gives isn't the absence of trouble; it's a calm that holds even when trouble comes.",
    "Peace is a gift you can receive today, even in the middle of things.",
    "Jesus, give me your peace. Settle my heart when it feels troubled or afraid. Amen."
  ],
  "2 Corinthians 5:17": [
    "In Christ, the old is gone and the new has come. Your past is part of your story, but it isn't the whole of who you are.",
    "You're allowed to grow out of who you used to be.",
    "Lord, thank you for making me new. Help me live like the new person you say I am. Amen."
  ],
  "Proverbs 18:10": [
    "Ancient cities had strong towers where people ran for safety. God's name, who he is, is that kind of safe place for anyone who runs to him.",
    "You have somewhere safe to run.",
    "Lord, be my strong tower today. When I feel exposed or attacked, help me run to you. Amen."
  ],
  "Isaiah 26:3": [
    "Peace grows where our thoughts keep returning to God. A mind fixed on him doesn't drift as easily with every worry.",
    "Whenever your thoughts start spiralling, bring them back to Him.",
    "God, keep my mind steady on you, and give me your perfect peace today. Amen."
  ],
  "Psalm 27:1": [
    "If God is my light, I'm not lost in the dark. If he's my salvation and stronghold, then the things I fear are smaller than they look.",
    "Turn on the light. Fear looks smaller in it.",
    "Lord, be my light and my stronghold today. Help me not to fear. Amen."
  ],
  "Matthew 7:7": [
    "Ask, seek, knock: Jesus uses three verbs that keep going. Prayer isn't a one-time request; it's a relationship where we keep coming back.",
    "Keep knocking. Persistence is part of faith.",
    "Father, I'm asking, seeking and knocking. Thank you that you hear me and answer in your way and time. Amen."
  ],
  "1 John 4:18": [
    "The more we understand how completely God loves us, the less room there is for fear. Love doesn't just comfort fear; it pushes it out.",
    "You are fully loved. Let that crowd out the fear.",
    "God, fill me with your love so completely that fear has no room to stay. Amen."
  ],
  "Psalm 91:1-2": [
    "To \"dwell in the shelter\" means to live there, not just visit in emergencies. The psalmist made God his home address.",
    "Make God your home, not just your emergency exit.",
    "Lord, I want to live close to you. Be my shelter and my fortress today. Amen."
  ],
  "Romans 5:8": [
    "God didn't wait for us to clean up before showing his love. Christ died for us while we were still far from him. That's how we know his love is real.",
    "You didn't have to earn it. It was already given.",
    "Jesus, thank you for loving me first, even when I didn't deserve it. Help me live grateful today. Amen."
  ],
  "John 16:33": [
    "Jesus was honest: in this world we'll have trouble. But he also said to take heart, because he has already overcome the world.",
    "Trouble is real. So is the One who overcame it.",
    "Jesus, in my troubles today, help me take heart because you have overcome the world. Amen."
  ],
  "Deuteronomy 31:6": [
    "Moses spoke this to people about to face a new land and new battles without him. Leaders change; God's presence doesn't.",
    "People may come and go. He never leaves.",
    "Lord, thank you that you will never leave me or forsake me. Make me strong and courageous. Amen."
  ],
  "Psalm 100:4-5": [
    "This psalm invites us to come to God with thanks and praise. Gratitude is like opening the gate: it changes how we enter the day.",
    "Name three things you're thankful for before lunch.",
    "Lord, thank you for your goodness and your love that lasts forever. I praise you today. Amen."
  ],
  "Proverbs 17:17": [
    "A true friend sticks around through the hard times, not just the good ones. Proverbs says that's when friendship shows what it's made of.",
    "Check on a friend today. It might mean more than you think.",
    "Lord, thank you for my friends. Help me be a friend who loves at all times. Amen."
  ],
  "Hebrews 12:1-2": [
    "Life is described as a race to run with endurance, not a sprint. The secret is where we keep our eyes: fixed on Jesus, who ran ahead of us.",
    "Keep running your race. Don't compare it to anyone else's lane.",
    "Jesus, help me throw off what slows me down and keep my eyes on you as I run today. Amen."
  ],
  "Isaiah 43:2": [
    "God doesn't promise there will be no deep waters or fires. He promises we won't go through them alone, and they won't overwhelm us.",
    "You're going through it, not staying in it.",
    "Lord, be with me in the deep waters and the hot fires. Carry me through. Amen."
  ],
  "Psalm 16:11": [
    "The psalmist found joy not in things but in being near God. There is a fullness of joy that comes from his presence.",
    "Real joy is found close to Him. Take a moment to be still.",
    "God, show me the path of life, and fill me with joy in your presence today. Amen."
  ],
  "Mark 10:27": [
    "The disciples thought something was impossible. Jesus looked at them and said: with people, yes; with God, no. Nothing is beyond him.",
    "Don't write off what God can still do.",
    "Lord, I bring you the things that look impossible to me. Thank you that all things are possible with you. Amen."
  ],
  "Ephesians 4:32": [
    "Kindness and forgiveness flow from remembering how kindly God has treated us. We forgive because we've been forgiven.",
    "Be the kind voice in someone's day.",
    "Father, make me kind and tender-hearted. Help me forgive the way you've forgiven me. Amen."
  ],
  "1 Thessalonians 5:16-18": [
    "Rejoice always, pray continually, give thanks in everything. Not for everything, but in everything: even on a hard day there's something to be grateful for.",
    "Find one thing to be thankful for, even in a hard moment.",
    "Lord, teach me to rejoice, to pray throughout the day, and to give thanks in every situation. Amen."
  ],
  "Psalm 55:22": [
    "David wrote this while betrayed by a close friend. His answer was to hand his burden to God, who would hold him up.",
    "Leave the heavy thing with Him. He can carry it.",
    "Lord, I cast my burdens on you. Hold me up and keep me steady. Amen."
  ],
  "Nehemiah 8:10": [
    "The people were weeping as they heard God's word read. Nehemiah told them to celebrate instead: joy in God is a source of strength.",
    "Joy isn't weakness. It's strength.",
    "Lord, let your joy be my strength today. Lift my heart and steady my steps. Amen."
  ],
  "John 15:5": [
    "A branch doesn't strain to make grapes; it stays connected to the vine. Jesus says that fruitful lives come from staying connected to him.",
    "Stay connected. Fruit follows.",
    "Jesus, help me stay close to you today, so that my life bears good fruit. Amen."
  ],
  "Psalm 30:5": [
    "Weeping may stay for a night, but joy comes in the morning. Sorrow is real, but it isn't the last word.",
    "Hold on. Morning is coming.",
    "Lord, carry me through this night, and bring the morning of joy you've promised. Amen."
  ],
  "Romans 8:38-39": [
    "Paul lists everything he can think of, life, death, the present, the future, and says none of it can separate us from God's love in Christ.",
    "Nothing you face today can cut you off from God's love.",
    "God, thank you that nothing can separate me from your love. Help me live secure in it today. Amen."
  ],
  "Proverbs 4:23": [
    "The heart is like a wellspring: what's inside it flows out into everything we do. Guarding it means being careful what we let in.",
    "Be careful what you let into your heart. It shapes your life.",
    "Lord, guard my heart. Help me fill it with what is good, true and lovely. Amen."
  ],
  "Matthew 5:9": [
    "Peacemakers don't just avoid conflict; they actively work to bring people together. Jesus says they'll be called children of God.",
    "Be the one who calms things down today.",
    "Lord, make me a peacemaker in my home, my school, my work and my online spaces. Amen."
  ],
  "Psalm 145:18": [
    "God is near to everyone who calls on him sincerely. You don't need special words; you just need to call.",
    "He's one honest prayer away.",
    "Lord, I'm calling on you now. Thank you for being near. Amen."
  ]
};

function forReference(ref) {
  const d = D[ref];
  return d ? { devotion: d[0], encouragement: d[1], prayer: d[2] } : null;
}

module.exports = { forReference, D };
