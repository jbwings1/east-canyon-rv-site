import Foundation

struct Lesson: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let minutes: Int
    let sections: [LessonSection]
}

struct LessonSection: Identifiable, Hashable {
    let id: String
    let heading: String
    let body: String
}

enum LessonCatalog {
    static let all: [Lesson] = [
        Lesson(
            id: "hand-rankings",
            title: "Hand Rankings",
            subtitle: "From high card to royal flush",
            minutes: 4,
            sections: [
                LessonSection(
                    id: "hr-1",
                    heading: "Why rankings matter",
                    body: "Every showdown is decided by the best five-card poker hand. Learn the ladder cold — quizzes will ask you to recognize hands instantly."
                ),
                LessonSection(
                    id: "hr-2",
                    heading: "The ladder (weak → strong)",
                    body: "High Card → One Pair → Two Pair → Three of a Kind → Straight → Flush → Full House → Four of a Kind → Straight Flush → Royal Flush."
                ),
                LessonSection(
                    id: "hr-3",
                    heading: "Kickers & ties",
                    body: "When categories match, higher ranks win. Example: pair of aces with a king kicker beats pair of aces with a queen kicker. Same five cards = split pot."
                ),
            ]
        ),
        Lesson(
            id: "position",
            title: "Position",
            subtitle: "Act last when you can",
            minutes: 3,
            sections: [
                LessonSection(
                    id: "pos-1",
                    heading: "Early, middle, late",
                    body: "Early position acts first after the flop. Late position (especially the button) sees everyone else act first — that information is worth chips."
                ),
                LessonSection(
                    id: "pos-2",
                    heading: "Blinds",
                    body: "The small and big blinds post forced bets. They act last preflop, then first on later streets — a tough spot that needs stronger hands or careful defense."
                ),
                LessonSection(
                    id: "pos-3",
                    heading: "Rule of thumb",
                    body: "Play tighter up front, wider on the button. Same hand can be a fold early and a raise late."
                ),
            ]
        ),
        Lesson(
            id: "starting-hands",
            title: "Starting Hands",
            subtitle: "What to open and when",
            minutes: 5,
            sections: [
                LessonSection(
                    id: "sh-1",
                    heading: "Premiums",
                    body: "AA, KK, QQ, AKs, AK — raise for value from almost any seat. Don’t slow-play blindly; build a pot while you’re ahead."
                ),
                LessonSection(
                    id: "sh-2",
                    heading: "Suited & connectors",
                    body: "Suited hands and connectors gain value in position and multiway pots because they can make strong disguised hands (flushes, straights)."
                ),
                LessonSection(
                    id: "sh-3",
                    heading: "Trash is expensive",
                    body: "Weak offsuit hands (J3o, 92o) look playable but lose money over time — especially out of position. Folding is a skill."
                ),
            ]
        ),
        Lesson(
            id: "pot-odds",
            title: "Pot Odds",
            subtitle: "Price your draws correctly",
            minutes: 5,
            sections: [
                LessonSection(
                    id: "po-1",
                    heading: "The idea",
                    body: "Pot odds compare the pot size to the cost of a call. If the pot is $100 and it costs $20 to call, you are getting 5∶1."
                ),
                LessonSection(
                    id: "po-2",
                    heading: "Break-even equity",
                    body: "Needed equity ≈ call / (pot + call). A $20 call into $100 needs about 16.7% equity to break even."
                ),
                LessonSection(
                    id: "po-3",
                    heading: "Outs shortcut",
                    body: "Rough equity: outs × 2% per street (turn or river), or outs × 4% from flop to river. 9 flush outs ≈ 18% to hit next card, ≈ 36% by the river."
                ),
            ]
        ),
        Lesson(
            id: "streets",
            title: "Betting Streets",
            subtitle: "Preflop → river decisions",
            minutes: 4,
            sections: [
                LessonSection(
                    id: "st-1",
                    heading: "Preflop",
                    body: "Decide whether your hole cards are worth entering the pot. Prefer raises over limps with strong hands."
                ),
                LessonSection(
                    id: "st-2",
                    heading: "Flop & turn",
                    body: "Three, then four community cards. Ask: did I improve? Do I have a draw? Who has position? Pot control with medium hands; pressure with strong ones."
                ),
                LessonSection(
                    id: "st-3",
                    heading: "River",
                    body: "No more cards. Value bet hands that beat calling ranges; bluff when enough fold equity exists; check when unsure."
                ),
            ]
        ),
    ]
}
