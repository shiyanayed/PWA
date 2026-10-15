export type PatristicEpoch = 'Apostolic Fathers' | 'Ante-Nicene' | 'Nicene & Post-Nicene'

export interface PatristicWitness {
  father: string
  epoch: PatristicEpoch
  dates: string
  work: string
  excerpt: string
  context: string
  sourceUrl: string
  sourceLabel: string
}

export const patristicWitnesses: PatristicWitness[] = [
  {
    father: 'Clement of Rome',
    epoch: 'Apostolic Fathers',
    dates: 'Late 1st century',
    work: '1 Clement 2.1',
    excerpt: 'You were all distinguished by humility, and were in no respect puffed up with pride, but yielded obedience rather than extorted it.',
    context: 'Clement recalls the Corinthians’ humility and communal conduct before criticizing the factional conflict described in the letter.',
    sourceUrl: 'https://www.earlychristianwritings.com/text/1clement-roberts.html',
    sourceLabel: 'Roberts-Donaldson translation, Early Christian Writings',
  },
  {
    father: 'The Didache',
    epoch: 'Apostolic Fathers',
    dates: 'Late 1st or early 2nd century',
    work: 'Didache 1.1',
    excerpt: 'There are two ways, one of life and one of death, and there is a great difference between the two ways.',
    context: 'The opening of an early Christian teaching on moral formation. This is a short translation excerpt, not evidence for a particular Greek lemma by itself.',
    sourceUrl: 'https://www.earlychristianwritings.com/text/didache-lightfoot.html',
    sourceLabel: 'J. B. Lightfoot translation, Early Christian Writings',
  },
  {
    father: 'Ignatius of Antioch',
    epoch: 'Apostolic Fathers',
    dates: 'Early 2nd century',
    work: 'Letter to the Ephesians 7.2',
    excerpt: 'There is one Physician who is possessed both of flesh and spirit; both made and not made; God existing in flesh; true life in death.',
    context: 'Ignatius uses a medical metaphor for Christ in a polemic against teachers he regards as deceptive. The quotation reflects the cited translation and should be read in its paragraph.',
    sourceUrl: 'https://www.earlychristianwritings.com/text/ignatius-ephesians-roberts.html',
    sourceLabel: 'Roberts-Donaldson translation, Early Christian Writings',
  },
  {
    father: 'Ignatius of Antioch',
    epoch: 'Apostolic Fathers',
    dates: 'Early 2nd century',
    work: 'Letter to the Romans 4.1',
    excerpt: 'I am the wheat of God, and am ground by the teeth of the wild beasts, that I may be found the pure bread of God.',
    context: 'Writing as a prisoner en route to Rome, Ignatius asks the Roman Christians not to prevent his anticipated martyrdom. This is his rhetoric in the cited translation, not an independent account of his death.',
    sourceUrl: 'https://www.earlychristianwritings.com/text/ignatius-romans-roberts.html',
    sourceLabel: 'Roberts-Donaldson translation, Early Christian Writings',
  },
  {
    father: 'Polycarp of Smyrna',
    epoch: 'Apostolic Fathers',
    dates: 'Early 2nd century',
    work: 'Letter to the Philippians 1.1',
    excerpt: 'The strong root of your faith, spoken of in days long gone by, endureth even until now, and bringeth forth fruit to our Lord Jesus Christ.',
    context: 'Polycarp praises the Philippians’ enduring faith and their care for imprisoned Christians; the passage reflects the letter’s pastoral setting.',
    sourceUrl: 'https://www.earlychristianwritings.com/text/polycarp-roberts.html',
    sourceLabel: 'Roberts-Donaldson translation, Early Christian Writings',
  },
  {
    father: 'Justin Martyr',
    epoch: 'Ante-Nicene',
    dates: 'Mid-2nd century',
    work: 'First Apology 13',
    excerpt: 'We praise Him to the utmost of our power by the exercise of prayer and thanksgiving for all things wherewith we are supplied.',
    context: 'Justin summarizes Christian worship and thanksgiving while explaining Christian practice to Roman authorities.',
    sourceUrl: 'https://www.newadvent.org/fathers/0126.htm',
    sourceLabel: 'The First Apology, New Advent',
  },
  {
    father: 'Irenaeus of Lyons',
    epoch: 'Ante-Nicene',
    dates: 'Late 2nd century',
    work: 'Against Heresies 3.3.1',
    excerpt: 'It is within the power of all, therefore, in every Church, who may wish to see the truth, to contemplate clearly the tradition of the apostles manifested throughout the whole world.',
    context: 'Irenaeus argues for public apostolic teaching and succession while responding to rival claims of hidden knowledge. This excerpt represents his argument in the cited translation.',
    sourceUrl: 'https://www.earlychristianwritings.com/text/irenaeus-book3.html',
    sourceLabel: 'Roberts-Donaldson translation, Early Christian Writings',
  },
  {
    father: 'Athanasius of Alexandria',
    epoch: 'Nicene & Post-Nicene',
    dates: '4th century',
    work: 'On the Incarnation 10.5',
    excerpt: 'By the Word of God being made man has come about the destruction of death and the resurrection of life.',
    context: 'Athanasius explains the fittingness of the incarnation in relation to human corruption and resurrection. This is an excerpt from the Roberts translation.',
    sourceUrl: 'https://www.newadvent.org/fathers/2802.htm',
    sourceLabel: 'Roberts translation, New Advent',
  },
  {
    father: 'Basil of Caesarea',
    epoch: 'Nicene & Post-Nicene',
    dates: '4th century',
    work: 'On the Holy Spirit 1.2',
    excerpt: 'It follows then that to investigate syllables is not to shoot wide of the mark.',
    context: 'Basil argues that careful attention to theological language matters, even when the question appears to concern a small detail.',
    sourceUrl: 'https://www.newadvent.org/fathers/3203.htm',
    sourceLabel: 'NPNF translation, New Advent',
  },
]
