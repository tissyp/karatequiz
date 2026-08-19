import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  SafeAreaView, 
  Image,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font'; 
import { databaseDomande } from './dati';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formattaTesto = (testo) => {
  if (!testo || typeof testo !== 'string') return "";
  return testo.replace(/\[(cite|\d+)[^\]]*\]/gi, '').trim();
};

const mescolaArray = (array) => {
  const mescolato = [...array];
  for (let i = mescolato.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mescolato[i], mescolato[j]] = [mescolato[j], mescolato[i]];
  }
  return mescolato;
};

export default function App() {
  const [fontsLoaded] = useFonts({
    'FigmaFont-Regular': require('./assets/fonts/AtkinsonHyperlegible-Regular.ttf'), 
    'FigmaFont-Bold': require('./assets/fonts/AtkinsonHyperlegible-Bold.ttf'),    
  });

  const [appMode, setAppMode] = useState('MENU');
  const [currentQuizType, setCurrentQuizType] = useState(null);

  const [domandeImparate, setDomandeImparate] = useState([]);
  const [domandeCarenze, setDomandeCarenze] = useState([]);
  const [dimensioneBlocco, setDimensioneBlocco] = useState(10);

  const [activeQuestions, setActiveQuestions] = useState([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionErrors, setSessionErrors] = useState([]);

  // Stati per la modale delle aree tematiche
  const [modalTematicheVisible, setModalTematicheVisible] = useState(false);
  const [moduloInAvvio, setModuloInAvvio] = useState(null);
  const [tematicheDisponibili, setTematicheDisponibili] = useState([]);
  const [tematicheSelezionate, setTematicheSelezionate] = useState([]);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleVero = useRef(new Animated.Value(1)).current;
  const scaleFalso = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const caricaProgressi = async () => {
      try {
        const salvataggioImparate = await AsyncStorage.getItem('progressi_esame');
        const salvataggioCarenze = await AsyncStorage.getItem('carenze_esame');
        const salvataggioBlocco = await AsyncStorage.getItem('dimensione_blocco');

        if (salvataggioImparate !== null) setDomandeImparate(JSON.parse(salvataggioImparate));
        if (salvataggioCarenze !== null) setDomandeCarenze(JSON.parse(salvataggioCarenze));
        if (salvataggioBlocco !== null) setDimensioneBlocco(JSON.parse(salvataggioBlocco));
      } catch (error) {
        console.log("Errore nel caricamento:", error);
      }
    };
    caricaProgressi();
  }, []);

  const cambiaDimensioneBlocco = async (nuovaDimensione) => {
    setDimensioneBlocco(nuovaDimensione);
    try {
      await AsyncStorage.setItem('dimensione_blocco', JSON.stringify(nuovaDimensione));
    } catch (error) {}
  };

  const switchMode = (mode) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setAppMode(mode);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  // Prepara l'apertura della scelta aree tematiche
  const preparaAvvioModulo = (type) => {
    if (type === 'SIMULAZIONE' || type === 'RAPIDO' || type === 'CARENZE') {
      startQuiz(type);
      return;
    }
    const db = databaseDomande || [];
    const filtered = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === type);
    const topics = [...new Set(filtered.map(d => d.area_tematica || d.topic || 'Generale'))];
    
    setTematicheDisponibili(topics);
    setTematicheSelezionate(topics); // Seleziona tutto di default
    setModuloInAvvio(type);
    setModalTematicheVisible(true);
  };

  const toggleTematica = (topic) => {
    if (tematicheSelezionate.includes(topic)) {
      setTematicheSelezionate(prev => prev.filter(t => t !== topic));
    } else {
      setTematicheSelezionate(prev => [...prev, topic]);
    }
  };

  const confermaAvvioModulo = () => {
    if (tematicheSelezionate.length === 0) {
      Alert.alert("Attenzione", "Seleziona almeno un'area tematica.");
      return;
    }
    setModalTematicheVisible(false);
    startQuiz(moduloInAvvio, tematicheSelezionate);
  };

  // Funzione startQuiz aggiornata per accettare i topic selezionati
  const startQuiz = (type, topicsSelezionati = null) => {
    let mazzoFinale = [];
    const db = databaseDomande || [];

    if (type === 'KUMITE' || type === 'KATA') {
      let perDisciplina = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === type);
      
      // Filtra in base alle aree tematiche scelte
      if (topicsSelezionati) {
        perDisciplina = perDisciplina.filter(d => topicsSelezionati.includes(d.area_tematica || d.topic || 'Generale'));
      }

      if (perDisciplina.length === 0) {
        Alert.alert("Attenzione", `Nessuna domanda trovata per le selezioni correnti.`);
        return;
      }

      const daImparare = perDisciplina.filter(d => !domandeImparate.includes(d.id));
      const giaImparate = perDisciplina.filter(d => domandeImparate.includes(d.id));

      if (daImparare.length === 0 && giaImparate.length > 0) {
        mazzoFinale = mescolaArray(giaImparate).slice(0, dimensioneBlocco);
      } else {
        let targetNuove = Math.ceil(dimensioneBlocco * 0.8);
        let targetRipasso = dimensioneBlocco - targetNuove;

        if (giaImparate.length < targetRipasso) {
          targetNuove += (targetRipasso - giaImparate.length);
        } else if (daImparare.length < targetNuove) {
          targetRipasso += (targetNuove - daImparare.length);
        }

        const quanteNuove = Math.min(targetNuove, daImparare.length);
        const quanteRipasso = Math.min(targetRipasso, giaImparate.length);

        mazzoFinale = mescolaArray([
          ...mescolaArray(daImparare).slice(0, quanteNuove),
          ...mescolaArray(giaImparate).slice(0, quanteRipasso)
        ]);
      }
    } else if (type === 'CARENZE') {
      const carenzeDomande = db.filter(d => domandeCarenze.includes(d.id));
      if (carenzeDomande.length === 0) {
        Alert.alert("Ottimo!", "Non hai nessuna carenza da ripassare.");
        return;
      }
      mazzoFinale = mescolaArray(carenzeDomande).slice(0, dimensioneBlocco);
    } else if (type === 'RAPIDO') {
      mazzoFinale = mescolaArray([...db]).slice(0, dimensioneBlocco);
    } else if (type === 'SIMULAZIONE') {
      mazzoFinale = mescolaArray([...db]).slice(0, 70);
    }

    setActiveQuestions(mazzoFinale);
    setCurrentQIdx(0);
    setSessionCorrect(0);
    setSessionErrors([]);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setCurrentQuizType(type);
    progressAnim.setValue(0);
    switchMode('QUIZ');
  };

  const animateButton = (animValue) => {
    Animated.sequence([
      Animated.timing(animValue, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();
  };

  const handleAnswer = async (answerBoolean) => {
    if (isAnswered) return;
    animateButton(answerBoolean === true ? scaleVero : scaleFalso);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedAnswer(answerBoolean);
    setIsAnswered(true);

    const q = activeQuestions[currentQIdx];
    const correttaEsatta = q.risposta_corretta ? (q.risposta_corretta === 'VERO') : q.isTrue;
    const isCorretta = answerBoolean === correttaEsatta;

    if (isCorretta) {
      setSessionCorrect(prev => prev + 1);
      if (!domandeImparate.includes(q.id)) {
        const nuoveImparate = [...domandeImparate, q.id];
        setDomandeImparate(nuoveImparate);
        await AsyncStorage.setItem('progressi_esame', JSON.stringify(nuoveImparate));
      }
      if (domandeCarenze.includes(q.id)) {
        const nuoveCarenze = domandeCarenze.filter(id => id !== q.id);
        setDomandeCarenze(nuoveCarenze);
        await AsyncStorage.setItem('carenze_esame', JSON.stringify(nuoveCarenze));
      }
    } else {
      setSessionErrors(prev => [...prev, q]);
      if (!domandeCarenze.includes(q.id)) {
        const nuoveCarenze = [...domandeCarenze, q.id];
        setDomandeCarenze(nuoveCarenze);
        await AsyncStorage.setItem('carenze_esame', JSON.stringify(nuoveCarenze));
      }
    }

    Animated.timing(progressAnim, {
      toValue: (currentQIdx + 1) / activeQuestions.length,
      duration: 400,
      useNativeDriver: false
    }).start();
  };

  const handleNext = () => {
    // Interrompe la simulazione se ci sono 2 o più errori
    if (currentQuizType === 'SIMULAZIONE' && sessionErrors.length >= 2) {
      switchMode('RESULTS');
      return;
    }

    if (currentQIdx < activeQuestions.length - 1) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCurrentQIdx(prev => prev + 1);
      setSelectedAnswer(null);
      setIsAnswered(false);
    } else {
      switchMode('RESULTS');
    }
  };

  const resettaProgressi = async () => {
    await AsyncStorage.clear();
    setDomandeImparate([]);
    setDomandeCarenze([]);
    setDimensioneBlocco(10);
    Alert.alert("Reset", "Tutti i dati e i progressi sono stati azzerati.");
  };

  // Nuova logica di sblocco (Imparate complete + Zero Carenze)
  const db = databaseDomande || [];
  const totKumite = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === 'KUMITE').length;
  const totKata = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === 'KATA').length;
  
  const imparateKumite = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === 'KUMITE' && domandeImparate.includes(d.id)).length;
  const imparateKata = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === 'KATA' && domandeImparate.includes(d.id)).length;
  
  const carenzeKumite = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === 'KUMITE' && domandeCarenze.includes(d.id)).length;
  const carenzeKata = db.filter(d => (d.disciplina || d.category || '').toUpperCase() === 'KATA' && domandeCarenze.includes(d.id)).length;

  const kumiteCompletato = (imparateKumite >= totKumite && totKumite > 0) && carenzeKumite === 0;
  const kataCompletato = (imparateKata >= totKata && totKata > 0) && carenzeKata === 0;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.headerLogoContainer} 
        onPress={() => switchMode('MENU')}
      >
        <Image 
          source={require('./assets/logo-compatto.png')} 
          style={styles.logo} 
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Quiz Ufficiali di Gara</Text>
      {appMode !== 'MENU' && (
        <TouchableOpacity style={styles.homeBtn} onPress={() => switchMode('MENU')}>
          <Feather name="home" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );

  if (!fontsLoaded) return null;

  const domandaCorrente = activeQuestions[currentQIdx];
  const rispostaEsattaBool = domandaCorrente ? (domandaCorrente.risposta_corretta ? domandaCorrente.risposta_corretta === 'VERO' : domandaCorrente.isTrue) : false;
  const isSimulazioneFallita = currentQuizType === 'SIMULAZIONE' && sessionErrors.length >= 2;

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderHeader()}
      <Animated.View style={[styles.main, { opacity: fadeAnim }]}>
        
        {appMode === 'MENU' && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Il tuo Percorso</Text>
            <Text style={styles.subtitle}>Seleziona un modulo o personalizza la tua sessione.</Text>

            <View style={styles.cardImpostazioni}>
              <Text style={styles.titoloImpostazioni}>⚙️ Domande per sessione:</Text>
              <View style={styles.grigliaOpzioni}>
                {[5, 10, 15, 20].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[styles.pulsanteOpzione, dimensioneBlocco === num && styles.pulsanteOpzioneSelezionato]}
                    onPress={() => cambiaDimensioneBlocco(num)}
                  >
                    <Text style={[styles.testoOpzione, dimensioneBlocco === num && styles.testoOpzioneSelezionato]}>{num}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity style={[styles.card, styles.cardActive]} onPress={() => preparaAvvioModulo('KUMITE')}>
              <View style={[styles.iconBox, { backgroundColor: '#e6f0ff' }]}><Feather name="book-open" size={24} color="#00295c" /></View>
              <View style={styles.cardTextContent}>
                <Text style={styles.cardTitle}>1. Kumite 🥋</Text>
                <Text style={styles.cardDesc}>Imparate: {imparateKumite}/{totKumite} • Carenze: {carenzeKumite}</Text>
                {kumiteCompletato && <Text style={styles.badgeSuccess}>Completato</Text>}
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.card, kumiteCompletato ? styles.cardActive : styles.cardLocked]} 
              onPress={() => kumiteCompletato ? preparaAvvioModulo('KATA') : Alert.alert('Bloccato', 'Completa Kumite e azzera le carenze per sbloccare!')}
            >
              <View style={[styles.iconBox, kumiteCompletato ? { backgroundColor: '#e6f0ff' } : { backgroundColor: '#f1f5f9' }]}>
                <Feather name="book" size={24} color={kumiteCompletato ? "#00295c" : "#94a3b8"} />
              </View>
              <View style={styles.cardTextContent}>
                <Text style={styles.cardTitle}>2. Kata 🥋</Text>
                <Text style={styles.cardDesc}>Imparate: {imparateKata}/{totKata} • Carenze: {carenzeKata}</Text>
                {kataCompletato && <Text style={styles.badgeSuccess}>Completato</Text>}
              </View>
              {!kumiteCompletato && <Feather name="lock" size={20} color="#94a3b8" style={styles.lockIcon}/>}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.card, { marginTop: 0 }, kataCompletato ? styles.cardActive : styles.cardLocked]} 
              onPress={() => kataCompletato ? preparaAvvioModulo('SIMULAZIONE') : Alert.alert('Bloccato', 'Sblocca e completa Kumite e Kata senza carenze.')}
            >
              <View style={[styles.iconBox, { backgroundColor: '#fef3c7' }]}><Feather name="award" size={24} color="#d97706" /></View>
              <View style={styles.cardTextContent}>
                <Text style={styles.cardTitle}>🏆 Simulazione Esame</Text>
                <Text style={styles.cardDesc}>Test 70 domande (Max 1 errore)</Text>
              </View>
              {!kataCompletato && <Feather name="lock" size={20} color="#94a3b8" style={styles.lockIcon}/>}
            </TouchableOpacity>

            <View style={styles.extraGrid}>
              <TouchableOpacity style={[styles.extraCard, styles.cardActive]} onPress={() => preparaAvvioModulo('RAPIDO')}>
                <View style={[styles.iconBoxSmall, { backgroundColor: '#e0e7ff' }]}><Feather name="zap" size={20} color="#4f46e5" /></View>
                <Text style={styles.cardTitleSmall}>Allenamento Rapido</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.extraCard, domandeCarenze.length > 0 ? styles.cardActive : { opacity: 0.5, borderColor: '#e2e8f0' }]} 
                onPress={() => preparaAvvioModulo('CARENZE')}
              >
                <View style={[styles.iconBoxSmall, { backgroundColor: '#ffe4e6' }]}><Feather name="alert-triangle" size={20} color="#e11d48" /></View>
                <Text style={styles.cardTitleSmall}>Carenze ({domandeCarenze.length})</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={resettaProgressi} style={styles.resetContainer}>
              <Text style={styles.resetText}>Azzera memoria app</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* MODALE PER LA SCELTA DELLE AREE TEMATICHE */}
        <Modal
          visible={modalTematicheVisible}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Scegli Aree Tematiche</Text>
              <Text style={styles.modalSubtitle}>Seleziona gli argomenti per questa sessione di {moduloInAvvio}</Text>
              
              <ScrollView style={styles.modalScroll}>
                {tematicheDisponibili.map((topic, index) => {
                  const isSelezionato = tematicheSelezionate.includes(topic);
                  return (
                    <TouchableOpacity 
                      key={index} 
                      style={[styles.modalTopicRow, isSelezionato ? styles.modalTopicSelected : null]}
                      onPress={() => toggleTematica(topic)}
                    >
                      <View style={[styles.checkbox, isSelezionato ? styles.checkboxChecked : null]}>
                        {isSelezionato && <Feather name="check" size={16} color="#fff" />}
                      </View>
                      <Text style={styles.modalTopicText}>{topic}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalTematicheVisible(false)}>
                  <Text style={styles.modalBtnCancelText}>Annulla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnStart} onPress={confermaAvvioModulo}>
                  <Text style={styles.modalBtnStartText}>Inizia</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {appMode === 'QUIZ' && domandaCorrente && (
          <View style={styles.quizContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressText}>{currentQuizType} • Dom {currentQIdx + 1}/{activeQuestions.length}</Text>
              <Text style={[styles.errorText, isSimulazioneFallita && {color: '#e11d48'}]}>
                Errori: {sessionErrors.length} {currentQuizType === 'SIMULAZIONE' ? '/ 1' : ''}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
            </View>

            <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
              <View style={styles.questionBox}>
                <View style={styles.topicBadge}>
                  <Text style={styles.topicBadgeText}>{domandaCorrente.area_tematica || domandaCorrente.topic || 'Generale'}</Text>
                </View>
                <Text style={styles.questionText}>
                  {formattaTesto(domandaCorrente.domanda || domandaCorrente.text)}
                </Text>

                <View style={styles.answersRow}>
                  <Animated.View style={[{ flex: 1, marginRight: 5 }, { transform: [{ scale: scaleVero }] }]}>
                    <TouchableOpacity
                      disabled={isAnswered}
                      style={[
                        styles.answerBtn,
                        isAnswered && selectedAnswer === true && rispostaEsattaBool ? styles.answerCorrect : null,
                        isAnswered && selectedAnswer === true && !rispostaEsattaBool ? styles.answerWrong : null,
                        isAnswered && selectedAnswer !== true ? styles.answerDisabled : null
                      ]}
                      onPress={() => handleAnswer(true)}
                    >
                      <Text style={[styles.answerBtnText, isAnswered && selectedAnswer === true && styles.answerBtnTextWhite]}>VERO</Text>
                    </TouchableOpacity>
                  </Animated.View>

                  <Animated.View style={[{ flex: 1, marginLeft: 5 }, { transform: [{ scale: scaleFalso }] }]}>
                    <TouchableOpacity
                      disabled={isAnswered}
                      style={[
                        styles.answerBtn,
                        isAnswered && selectedAnswer === false && !rispostaEsattaBool ? styles.answerCorrect : null,
                        isAnswered && selectedAnswer === false && rispostaEsattaBool ? styles.answerWrong : null,
                        isAnswered && selectedAnswer !== false ? styles.answerDisabled : null
                      ]}
                      onPress={() => handleAnswer(false)}
                    >
                      <Text style={[styles.answerBtnText, isAnswered && selectedAnswer === false && styles.answerBtnTextWhite]}>FALSO</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>

              {isAnswered && (
                <View style={[styles.explanationBox, selectedAnswer === rispostaEsattaBool ? styles.borderCorrect : styles.borderWrong]}>
                  <View style={styles.explanationHeader}>
                    <Feather 
                      name={selectedAnswer === rispostaEsattaBool ? "check-circle" : "x-circle"} 
                      size={24} 
                      color={selectedAnswer === rispostaEsattaBool ? "#10b981" : "#e11d48"} 
                    />
                    <Text style={[styles.explanationTitle, selectedAnswer === rispostaEsattaBool ? { color: '#10b981' } : { color: '#e11d48' }]}>
                      {selectedAnswer === rispostaEsattaBool ? "Corretto!" : "Errato"}
                    </Text>
                  </View>
                  <Text style={styles.explanationText}>
                    La risposta corretta era <Text style={{ fontFamily: 'FigmaFont-Bold' }}>{rispostaEsattaBool ? "Vero" : "Falso"}</Text>.
                  </Text>
                  
                  <View style={styles.ruleBox}>
                    <Text style={styles.ruleDesc}>{formattaTesto(domandaCorrente.spiegazione || domandaCorrente.explanation)}</Text>
                    <Text style={styles.ruleArticle}>
                      <Feather name="book-open" size={14}/> {formattaTesto(domandaCorrente.articolo || domandaCorrente.article)}
                    </Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.nextBtn, isSimulazioneFallita ? { backgroundColor: '#e11d48' } : null]} 
                    onPress={handleNext}
                  >
                    <Text style={styles.nextBtnText}>
                      {isSimulazioneFallita ? 'Simulazione Fallita (Termina)' : (currentQIdx < activeQuestions.length - 1 ? 'Continua' : 'Termina')}
                    </Text>
                    <Feather name="arrow-right" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {appMode === 'RESULTS' && (
          <View style={styles.resultsContainer}>
            <View style={styles.resultsBox}>
              <Feather 
                name={
                  currentQuizType === 'SIMULAZIONE' && sessionErrors.length >= 2 
                    ? "x-circle" 
                    : (sessionErrors.length === 0 ? "check-circle" : "alert-triangle")
                } 
                size={64} 
                color={
                  currentQuizType === 'SIMULAZIONE' && sessionErrors.length >= 2 
                    ? "#e11d48" 
                    : (sessionErrors.length === 0 ? "#10b981" : "#eab308")
                } 
                style={{ marginBottom: 20 }} 
              />
              <Text style={styles.resultsTitle}>
                {currentQuizType === 'SIMULAZIONE' && sessionErrors.length >= 2
                  ? "Esame Fallito"
                  : (sessionErrors.length === 0 ? "Perfetto!" : "Sessione Completata")}
              </Text>
              <Text style={styles.resultsSubtitle}>
                {currentQuizType === 'SIMULAZIONE' && sessionErrors.length >= 2
                  ? "Hai commesso più di un errore. Riprova quando sarai pronto."
                  : `Hai risposto correttamente a ${sessionCorrect} domande su ${currentQIdx + 1}.`}
              </Text>
              
              <View style={styles.scoreRow}>
                <View style={styles.scoreItem}>
                  <Text style={[styles.scoreValue, { color: '#10b981' }]}>{sessionCorrect}</Text>
                  <Text style={styles.scoreLabel}>Esatte</Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={[styles.scoreValue, { color: '#e11d48' }]}>{sessionErrors.length}</Text>
                  <Text style={styles.scoreLabel}>Errate</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.homeBtnLg} onPress={() => switchMode('MENU')}>
                <Text style={styles.homeBtnLgText}>Torna al Menu</Text>
              </TouchableOpacity>
              
              {(currentQuizType !== 'SIMULAZIONE' || sessionErrors.length >= 2) && (
                <TouchableOpacity style={styles.retryBtn} onPress={() => startQuiz(currentQuizType)}>
                  <Text style={styles.retryBtnText}>Ripeti Modulo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#00295c' },
  main: { flex: 1, backgroundColor: '#f4f7fb' },
  
  header: { height: 70, backgroundColor: '#00295c', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, justifyContent: 'space-between' },
  headerLogoContainer: { backgroundColor: 'transparent' }, 
  logo: { width: 90, height: 35 }, 
  headerTitle: { color: '#fff', fontSize: 18, fontFamily: 'FigmaFont-Bold', flex: 1, marginLeft: 15 },
  homeBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8 },
  
  scrollContent: { padding: 20 },
  title: { fontSize: 28, fontFamily: 'FigmaFont-Bold', color: '#1e293b', marginBottom: 5 },
  subtitle: { fontSize: 15, fontFamily: 'FigmaFont-Regular', color: '#64748b', marginBottom: 20 },
  
  cardImpostazioni: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  titoloImpostazioni: { fontSize: 14, fontFamily: 'FigmaFont-Bold', color: '#1e293b', marginBottom: 10, textAlign: 'center' },
  grigliaOpzioni: { flexDirection: 'row', justifyContent: 'space-around' },
  pulsanteOpzione: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#f1f5f9' },
  pulsanteOpzioneSelezionato: { backgroundColor: '#00295c' },
  testoOpzione: { fontSize: 15, fontFamily: 'FigmaFont-Bold', color: '#64748b' },
  testoOpzioneSelezionato: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 15, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 2, borderColor: '#e2e8f0' },
  cardActive: { borderColor: '#00295c' },
  cardLocked: { opacity: 0.6 },
  iconBox: { padding: 12, borderRadius: 12, marginRight: 15 },
  cardTextContent: { flex: 1 },
  cardTitle: { fontSize: 18, fontFamily: 'FigmaFont-Bold', color: '#1e293b', marginBottom: 5 },
  cardDesc: { fontSize: 14, fontFamily: 'FigmaFont-Regular', color: '#64748b', marginBottom: 8, lineHeight: 20 },
  badgeSuccess: { alignSelf: 'flex-start', backgroundColor: '#d1fae5', color: '#065f46', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontFamily: 'FigmaFont-Bold', overflow: 'hidden' },
  lockIcon: { position: 'absolute', right: 20, top: 20 },
  
  extraGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  extraCard: { backgroundColor: '#fff', borderRadius: 16, padding: 15, width: '48%', borderWidth: 2, borderColor: '#e2e8f0' },
  iconBoxSmall: { alignSelf: 'flex-start', padding: 10, borderRadius: 12, marginBottom: 10 }, 
  cardTitleSmall: { fontSize: 16, fontFamily: 'FigmaFont-Bold', color: '#1e293b' },
  
  // Stili per Modale Tematiche
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', width: '100%', borderRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontFamily: 'FigmaFont-Bold', color: '#1e293b', marginBottom: 5 },
  modalSubtitle: { fontSize: 14, fontFamily: 'FigmaFont-Regular', color: '#64748b', marginBottom: 15 },
  modalScroll: { marginBottom: 20 },
  modalTopicRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  modalTopicSelected: { backgroundColor: '#f8fafc' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', marginRight: 15, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#00295c', borderColor: '#00295c' },
  modalTopicText: { fontSize: 15, fontFamily: 'FigmaFont-Regular', color: '#334155', flex: 1 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtnCancel: { padding: 15, flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#f1f5f9', marginRight: 10 },
  modalBtnCancelText: { fontFamily: 'FigmaFont-Bold', color: '#64748b', fontSize: 16 },
  modalBtnStart: { padding: 15, flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#00295c', marginLeft: 10 },
  modalBtnStartText: { fontFamily: 'FigmaFont-Bold', color: '#fff', fontSize: 16 },

  quizContainer: { flex: 1, padding: 20 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressText: { color: '#64748b', fontFamily: 'FigmaFont-Bold', fontSize: 12, textTransform: 'uppercase' },
  errorText: { color: '#00295c', fontFamily: 'FigmaFont-Bold', fontSize: 14 },
  progressBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, marginBottom: 20 },
  progressBarFill: { height: '100%', backgroundColor: '#00295c', borderRadius: 4 },
  
  questionBox: { backgroundColor: '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20 },
  topicBadge: { alignSelf: 'flex-start', backgroundColor: '#e6f0ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 15 },
  topicBadgeText: { color: '#00295c', fontFamily: 'FigmaFont-Bold', fontSize: 12, textTransform: 'uppercase' },
  questionText: { fontSize: 20, fontFamily: 'FigmaFont-Bold', color: '#1e293b', marginBottom: 25, lineHeight: 28 },
  
  answersRow: { flexDirection: 'row', justifyContent: 'space-between' },
  answerBtn: { flex: 1, paddingVertical: 18, borderRadius: 12, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center' },
  answerCorrect: { backgroundColor: '#10b981', borderColor: '#10b981' },
  answerWrong: { backgroundColor: '#e11d48', borderColor: '#e11d48' },
  answerDisabled: { opacity: 0.4 },
  answerBtnText: { fontSize: 18, fontFamily: 'FigmaFont-Bold', color: '#475569' },
  answerBtnTextWhite: { color: '#fff' },
  
  explanationBox: { backgroundColor: '#fff', borderRadius: 20, padding: 20, borderLeftWidth: 8, marginBottom: 20 },
  borderCorrect: { borderLeftColor: '#10b981' },
  borderWrong: { borderLeftColor: '#e11d48' },
  explanationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  explanationTitle: { fontSize: 18, fontFamily: 'FigmaFont-Bold', marginLeft: 10 },
  explanationText: { fontSize: 16, fontFamily: 'FigmaFont-Regular', color: '#475569', marginBottom: 15 },
  ruleBox: { backgroundColor: '#f8fafc', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  ruleDesc: { fontSize: 15, fontFamily: 'FigmaFont-Regular', color: '#334155', marginBottom: 10, lineHeight: 22 },
  ruleArticle: { fontSize: 14, fontFamily: 'FigmaFont-Bold', color: '#00295c' },
  nextBtn: { backgroundColor: '#00295c', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, marginTop: 20 },
  nextBtnText: { color: '#fff', fontSize: 18, fontFamily: 'FigmaFont-Bold', marginRight: 10 },
  
  resultsContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  resultsBox: { backgroundColor: '#fff', borderRadius: 24, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  resultsTitle: { fontSize: 24, fontFamily: 'FigmaFont-Bold', color: '#1e293b', textAlign: 'center', marginBottom: 10 },
  resultsSubtitle: { fontSize: 16, fontFamily: 'FigmaFont-Regular', color: '#64748b', textAlign: 'center', marginBottom: 20 },
  scoreRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 16, padding: 20, width: '100%', justifyContent: 'space-around', marginBottom: 30 },
  scoreItem: { alignItems: 'center' },
  scoreValue: { fontSize: 40, fontFamily: 'FigmaFont-Bold', marginBottom: 5 },
  scoreLabel: { fontSize: 12, fontFamily: 'FigmaFont-Bold', color: '#94a3b8', textTransform: 'uppercase' },
  homeBtnLg: { backgroundColor: '#e2e8f0', paddingVertical: 15, width: '100%', borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  homeBtnLgText: { fontSize: 16, fontFamily: 'FigmaFont-Bold', color: '#475569' },
  retryBtn: { backgroundColor: '#00295c', paddingVertical: 15, width: '100%', borderRadius: 12, alignItems: 'center' },
  retryBtnText: { fontSize: 16, fontFamily: 'FigmaFont-Bold', color: '#fff' },
  
  resetContainer: { marginTop: 25, alignItems: 'center', paddingBottom: 15 },
  resetText: { color: '#94a3b8', fontSize: 13, textDecorationLine: 'underline', fontFamily: 'FigmaFont-Regular' }
});