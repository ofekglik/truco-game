import React, { useState } from 'react';

interface GameGuideProps {
  onClose: () => void;
}

interface Slide {
  title: string;
  content: React.ReactNode;
}

const CardImg: React.FC<{ suit: string; rank: number; size?: 'sm' | 'md' }> = ({ suit, rank, size = 'sm' }) => (
  <img
    src={`/cards/${suit}/${rank}.png`}
    alt={`${suit}-${rank}`}
    className={size === 'sm' ? 'h-16 rounded shadow-md' : 'h-24 rounded-lg shadow-lg'}
  />
);

const SuitIcon: React.FC<{ suit: string; symbol: string; color: string; name: string }> = ({ symbol, color, name }) => (
  <div className="flex flex-col items-center gap-1">
    <span className="text-2xl">{symbol}</span>
    <span className="text-xs font-bold" style={{ color }}>{name}</span>
  </div>
);

export const GameGuide: React.FC<GameGuideProps> = ({ onClose }) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: Slide[] = [
    // Slide 1: מה המשחק?
    {
      title: 'מה המשחק?',
      content: (
        <div className="space-y-4 text-center">
          <p className="text-3xl">🃏</p>
          <p className="text-gray-200 text-base leading-relaxed">
            <strong className="text-yellow-400">אטו</strong> הוא משחק קלפים ל-4 שחקנים בזוגות.
          </p>
          <p className="text-gray-300 text-sm leading-relaxed">
            המטרה: לצבור נקודות על ידי לקיחת קלפים בעלי ערך.
            <br />
            הקבוצה שקנתה צריכה להגיע למספר הנקודות שהתחייבה — אחרת היא נופלת!
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <CardImg suit="espadas" rank={1} size="md" />
            <CardImg suit="oros" rank={3} size="md" />
            <CardImg suit="copas" rank={12} size="md" />
            <CardImg suit="bastos" rank={11} size="md" />
          </div>
        </div>
      ),
    },

    // Slide 2: קבוצות
    {
      title: 'קבוצות ומושבים',
      content: (
        <div className="space-y-4 text-center">
          <p className="text-gray-200 text-sm leading-relaxed">
            4 שחקנים יושבים סביב השולחן.
            <br />
            שחקנים שיושבים <strong className="text-yellow-400">מול</strong> זה את זה הם שותפים.
          </p>
          <div className="relative w-48 h-48 mx-auto my-4">
            {/* Table */}
            <div className="absolute inset-6 rounded-xl bg-green-900/60 border-2 border-green-700/50" />
            {/* Players */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 text-center">
              <div className="bg-blue-500/30 border border-blue-400 rounded-lg px-3 py-1 text-xs font-bold text-blue-400">שחקן 2</div>
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
              <div className="bg-blue-500/30 border border-blue-400 rounded-lg px-3 py-1 text-xs font-bold text-blue-400">שחקן 1</div>
            </div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 text-center">
              <div className="bg-red-500/30 border border-red-400 rounded-lg px-3 py-1 text-xs font-bold text-red-400">שחקן 3</div>
            </div>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-center">
              <div className="bg-red-500/30 border border-red-400 rounded-lg px-3 py-1 text-xs font-bold text-red-400">שחקן 4</div>
            </div>
            {/* Lines connecting partners */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 192 192">
              <line x1="96" y1="28" x2="96" y2="164" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="4" opacity="0.5" />
              <line x1="28" y1="96" x2="164" y2="96" stroke="#DC2626" strokeWidth="1.5" strokeDasharray="4" opacity="0.5" />
            </svg>
          </div>
          <p className="text-gray-400 text-xs">
            <span className="text-blue-400">כחולה</span> = שותפים &nbsp;|&nbsp; <span className="text-red-400">אדומה</span> = שותפים
          </p>
        </div>
      ),
    },

    // Slide 3: חפיסת קלפים
    {
      title: 'חפיסת קלפים',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            40 קלפים, 4 סוגים, מדורגים לפי <strong className="text-yellow-400">כוח</strong> (לא לפי מספר!):
          </p>
          {/* Suits */}
          <div className="flex justify-center gap-6">
            <SuitIcon suit="oros" symbol="🪙" color="#FFD700" name="זהב" />
            <SuitIcon suit="copas" symbol="🏆" color="#DC2626" name="קופז" />
            <SuitIcon suit="espadas" symbol="⚔️" color="#3B82F6" name="ספדה" />
            <SuitIcon suit="bastos" symbol="🪵" color="#22C55E" name="שחור" />
          </div>
          {/* Power order */}
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-yellow-400 text-xs font-bold text-center mb-2">סדר כוח (חזק → חלש):</p>
            <div className="flex justify-center gap-1 flex-wrap">
              {[1, 3, 12, 11, 10, 7, 6, 5, 4, 2].map((rank, i) => (
                <div key={rank} className="flex flex-col items-center">
                  <CardImg suit="oros" rank={rank} />
                  <span className="text-[9px] text-gray-400 mt-0.5">{i === 0 ? '💪' : ''}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Point values */}
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-yellow-400 text-xs font-bold text-center mb-2">ערכי נקודות:</p>
            <div className="flex justify-center gap-3 text-xs text-gray-300 flex-wrap">
              <span>1 = <strong className="text-white">11</strong></span>
              <span>3 = <strong className="text-white">10</strong></span>
              <span>12 = <strong className="text-white">4</strong></span>
              <span>11 = <strong className="text-white">3</strong></span>
              <span>10 = <strong className="text-white">2</strong></span>
              <span>שאר = <strong className="text-white">0</strong></span>
            </div>
            <p className="text-gray-500 text-[10px] text-center mt-1">סה״כ 120 נקודות בחפיסה</p>
          </div>
        </div>
      ),
    },

    // Slide 4: לקיחות (Trick Play)
    {
      title: 'משחק לקיחות',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            כל שחקן משחק קלף אחד. הקלף <strong className="text-yellow-400">החזק ביותר</strong> לוקח.
          </p>
          <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
            <p className="text-yellow-400 text-xs font-bold text-center">חוקי הלקיחה:</p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 <strong>חובה</strong> לשחק מאותו סוג שנפתח (אם יש לך).
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 אם אין לך מאותו סוג — <strong>חובה</strong> לשחק אטו (אם יש).
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 אם אין לך גם אטו — שחק כל קלף.
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 קלף <strong className="text-yellow-400">אטו</strong> מנצח כל סוג אחר.
            </p>
          </div>
          {/* Example trick */}
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-gray-400 text-xs text-center mb-2">דוגמה: האטו הוא <span className="text-yellow-400">🪙 זהב</span></p>
            <div className="flex justify-center gap-2 items-end">
              <div className="flex flex-col items-center">
                <CardImg suit="espadas" rank={12} />
                <span className="text-[9px] text-gray-400 mt-1">פותח</span>
              </div>
              <div className="flex flex-col items-center">
                <CardImg suit="espadas" rank={1} />
                <span className="text-[9px] text-gray-400 mt-1">ספדה</span>
              </div>
              <div className="flex flex-col items-center">
                <CardImg suit="oros" rank={4} />
                <span className="text-[9px] text-yellow-400 mt-1">אטו!</span>
              </div>
              <div className="flex flex-col items-center">
                <CardImg suit="espadas" rank={7} />
                <span className="text-[9px] text-gray-400 mt-1">ספדה</span>
              </div>
            </div>
            <p className="text-green-400 text-xs text-center mt-2">🪙 זהב 4 מנצח — אטו מנצח הכל!</p>
          </div>
        </div>
      ),
    },

    // Slide 5: ניקוד
    {
      title: 'ניקוד וחישוב',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            בסוף 10 לקיחות, סופרים את <strong className="text-yellow-400">נקודות הקלפים</strong> שכל קבוצה אספה.
          </p>
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-yellow-400 text-xs font-bold text-center mb-2">חישוב הסיבוב:</p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 נקודות קלפים (מתוך 120) + נקודות שירה
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 הקבוצה <strong>הקונה</strong> חייבת להגיע למספר שקנתה (לפחות)
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 אם הקונה <strong className="text-green-400">הצליחה</strong> — היא מקבלת את מה שקנתה
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 אם הקונה <strong className="text-red-400">נפלה</strong> — הקבוצה השנייה מקבלת את הנקודות
            </p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-gray-400 text-xs text-center mb-2">דוגמה:</p>
            <p className="text-gray-300 text-xs text-center">
              כחולה קנתה <strong className="text-yellow-400">90</strong> ואספה 95 נקודות
              <br />
              <span className="text-green-400">✅ הצליחה!</span> כחולה מקבלת 90
            </p>
            <p className="text-gray-500 text-[10px] text-center mt-1">—</p>
            <p className="text-gray-300 text-xs text-center">
              כחולה קנתה <strong className="text-yellow-400">90</strong> ואספה 80 נקודות
              <br />
              <span className="text-red-400">❌ נפלה!</span> אדומה מקבלת 90
            </p>
          </div>
        </div>
      ),
    },

    // Slide 6: קנייה (Bidding)
    {
      title: 'קנייה (בידינג)',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            לפני המשחק, השחקנים <strong className="text-yellow-400">מתחרים</strong> על הזכות לבחור את האטו.
          </p>
          <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
            <p className="text-yellow-400 text-xs font-bold text-center">איך זה עובד:</p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 מתחילים מ-70 ועולים ב-10 (70, 80, 90...)
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 כל שחקן מציע מספר גבוה יותר או <strong>פאס</strong>
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 מי שהציע הכי גבוה — <strong className="text-yellow-400">קונה</strong> ובוחר את האטו
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 הוא מתחייב שהקבוצה שלו תצבור לפחות את המספר שקנה
            </p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-gray-400 text-xs text-center mb-2">דוגמה:</p>
            <div className="flex justify-center gap-4 text-xs">
              <div className="text-center">
                <div className="bg-blue-500/20 border border-blue-400/50 rounded-lg px-2 py-1 text-blue-400 font-bold">שחקן 1</div>
                <p className="text-gray-400 mt-1">70</p>
              </div>
              <div className="text-center">
                <div className="bg-red-500/20 border border-red-400/50 rounded-lg px-2 py-1 text-red-400 font-bold">שחקן 2</div>
                <p className="text-gray-400 mt-1">80</p>
              </div>
              <div className="text-center">
                <div className="bg-blue-500/20 border border-blue-400/50 rounded-lg px-2 py-1 text-blue-400 font-bold">שחקן 3</div>
                <p className="text-gray-400 mt-1">פאס</p>
              </div>
              <div className="text-center">
                <div className="bg-red-500/20 border border-red-400/50 rounded-lg px-2 py-1 text-red-400 font-bold">שחקן 4</div>
                <p className="text-yellow-400 mt-1 font-bold">90 ✓</p>
              </div>
            </div>
            <p className="text-gray-400 text-[10px] text-center mt-2">שחקן 4 קנה ב-90 — קבוצתו חייבת לצבור 90+</p>
          </div>
        </div>
      ),
    },

    // Slide 7: הכרזת אטו
    {
      title: 'הכרזת אטו',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            הקונה בוחר סוג קלף אחד כ<strong className="text-yellow-400">אטו</strong> (שליט).
            <br />
            קלפי האטו מנצחים כל סוג אחר!
          </p>
          <div className="flex justify-center gap-6 py-2">
            <div className="flex flex-col items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
              <span className="text-3xl">🪙</span>
              <span className="text-yellow-400 text-xs font-bold">זהב</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-gray-700/30 border border-gray-600/30 rounded-xl px-4 py-3 opacity-50">
              <span className="text-3xl">🏆</span>
              <span className="text-gray-400 text-xs">קופז</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-gray-700/30 border border-gray-600/30 rounded-xl px-4 py-3 opacity-50">
              <span className="text-3xl">⚔️</span>
              <span className="text-gray-400 text-xs">ספדה</span>
            </div>
            <div className="flex flex-col items-center gap-1 bg-gray-700/30 border border-gray-600/30 rounded-xl px-4 py-3 opacity-50">
              <span className="text-3xl">🪵</span>
              <span className="text-gray-400 text-xs">שחור</span>
            </div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-gray-300 text-xs text-center leading-relaxed">
              אם הקונה בחר <strong className="text-yellow-400">🪙 זהב</strong> כאטו —
              <br />
              כל קלף זהב מנצח כל קלף מסוגים אחרים,
              <br />
              גם אם הוא חלש יותר (כמו 🪙 2).
            </p>
          </div>
        </div>
      ),
    },

    // Slide 8: שירה (Singing)
    {
      title: 'שירה (קנטה)',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            אם לשחקן בקבוצה הקונה יש <strong className="text-yellow-400">מלך + סוס</strong> מאותו סוג — הוא יכול <strong>לשיר</strong> לנקודות בונוס!
          </p>
          <div className="bg-gray-800/60 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-center gap-3">
              <CardImg suit="oros" rank={12} />
              <span className="text-xl">+</span>
              <CardImg suit="oros" rank={11} />
              <span className="text-xl">=</span>
              <span className="text-yellow-400 font-bold text-lg">20 נק׳</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <CardImg suit="copas" rank={12} />
              <span className="text-xl">+</span>
              <CardImg suit="copas" rank={11} />
              <span className="text-xl">=</span>
              <span className="text-yellow-400 font-bold text-lg">
                40 נק׳
                <span className="text-xs text-gray-400 mr-1">(אטו)</span>
              </span>
            </div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
            <p className="text-yellow-400 text-xs font-bold text-center">מתי שרים?</p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 <strong>לפני המשחק</strong> — שירה חופשית (כל השירות)
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 <strong>אחרי לקיחה</strong> — שירה אחת בלבד, הקונה בוחר מי שר
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 שירת אטו (מלך + סוס של האטו) = <strong className="text-yellow-400">40</strong> נקודות
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 שירה רגילה = <strong className="text-yellow-400">20</strong> נקודות
            </p>
          </div>
        </div>
      ),
    },

    // Slide 9: קאפו
    {
      title: 'קאפו',
      content: (
        <div className="space-y-4">
          <p className="text-gray-200 text-sm text-center leading-relaxed">
            <strong className="text-yellow-400">קאפו</strong> = הכרזה שהקבוצה תיקח את <strong>כל</strong> 10 הלקיחות!
          </p>
          <div className="bg-gray-800/60 rounded-xl p-3 space-y-2">
            <p className="text-yellow-400 text-xs font-bold text-center">שני סוגי קאפו:</p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 <strong>קאפו טכני</strong> — 4 מלכים או 4 סוסים ביד? קאפו אוטומטי! רק לקיחה אחת נדרשת.
            </p>
            <p className="text-gray-300 text-xs leading-relaxed">
              🔹 <strong>קאפו בקנייה</strong> — שחקן מכריז קאפו (230 נקודות). אם הצד השני לוקח ולו לקיחה אחת — הקאפו נכשל!
            </p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3">
            <p className="text-gray-400 text-xs text-center mb-2">תוצאות:</p>
            <p className="text-gray-300 text-xs text-center">
              <span className="text-green-400">✅ קאפו הצליח</span> — הקבוצה מקבלת 230 נקודות
            </p>
            <p className="text-gray-300 text-xs text-center mt-1">
              <span className="text-red-400">❌ קאפו נכשל</span> — הקבוצה השנייה מקבלת 230 נקודות
            </p>
          </div>
        </div>
      ),
    },

    // Slide 10: ניצחון
    {
      title: 'ניצחון!',
      content: (
        <div className="space-y-4 text-center">
          <p className="text-3xl">🏆</p>
          <p className="text-gray-200 text-base leading-relaxed">
            הקבוצה הראשונה שמגיעה ל-<strong className="text-yellow-400">1000 נקודות</strong> מנצחת!
          </p>
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
            <p className="text-yellow-400 text-xs font-bold">סיכום מהיר:</p>
            <div className="text-gray-300 text-xs space-y-1.5 text-right" dir="rtl">
              <p>1️⃣ <strong>קנייה</strong> — מתחרים על הזכות לבחור אטו</p>
              <p>2️⃣ <strong>אטו</strong> — הקונה בוחר את הסוג השליט</p>
              <p>3️⃣ <strong>שירה</strong> — מלך+סוס = נקודות בונוס</p>
              <p>4️⃣ <strong>לקיחות</strong> — 10 סיבובים, אוספים נקודות</p>
              <p>5️⃣ <strong>חישוב</strong> — הקונה צריך להגיע למה שקנה</p>
              <p>6️⃣ <strong>ניצחון</strong> — ראשון ל-1000 מנצח!</p>
            </div>
          </div>
          <p className="text-gray-500 text-xs">בהצלחה! 🎉</p>
        </div>
      ),
    },
  ];

  const goNext = () => {
    if (currentSlide < slides.length - 1) setCurrentSlide(currentSlide + 1);
  };

  const goPrev = () => {
    if (currentSlide > 0) setCurrentSlide(currentSlide - 1);
  };

  const isFirst = currentSlide === 0;
  const isLast = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-[#161b22] border border-gray-700/60 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/40">
          <h2 className="text-white font-bold text-base">{slides[currentSlide].title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg transition-colors px-1"
          >
            ✕
          </button>
        </div>

        {/* Slide content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {slides[currentSlide].content}
        </div>

        {/* Navigation */}
        <div className="px-4 py-3 border-t border-gray-700/40 flex items-center justify-between gap-3">
          <button
            onClick={goPrev}
            disabled={isFirst}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-default bg-gray-700 hover:bg-gray-600 text-white"
          >
            ◀ הקודם
          </button>

          {/* Dots */}
          <div className="flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentSlide
                    ? 'bg-yellow-400 scale-125'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 bg-yellow-500 hover:bg-yellow-400 text-gray-900"
            >
              סיום ✓
            </button>
          ) : (
            <button
              onClick={goNext}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95 bg-yellow-500 hover:bg-yellow-400 text-gray-900"
            >
              הבא ▶
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
