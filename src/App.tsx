import React, { useState, useRef, useEffect } from 'react';
import { auditService } from './services/auditService';
import { Question } from './types';
import { Loader2, Search, BookOpen, CheckCircle, XCircle, Upload, ArrowRight, ChevronLeft, ChevronRight, Info, HelpCircle, AlertCircle, LogIn, User as UserIcon, Database, Zap } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import { auth, googleProvider, signInWithPopup, onAuthStateChanged, User, getDocFromServer, doc, db } from './firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chapter, setChapter] = useState('');
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userHeading, setUserHeading] = useState('');
  const [userSubpoints, setUserSubpoints] = useState('');
  const [evaluation, setEvaluation] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ data: string; mimeType: string; name: string }[]>([]);
  const [showCriteria, setShowCriteria] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestFiles, setIngestFiles] = useState<{ data: string; mimeType: string; name: string }[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState('');
  const [dbStats, setDbStats] = useState<{ total: number; byChapter: Record<string, number>; sources: string[] } | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [showDbExplorer, setShowDbExplorer] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser?.email === 'gakhar.chelsie@gmail.com') {
        setIsAdmin(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAuthReady) {
      const testConnection = async () => {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration.");
          }
        }
      };
      testConnection();
    }
  }, [isAuthReady]);

  const resetSession = () => {
    setQuestions([]);
    setCurrentIndex(0);
    setUserHeading('');
    setUserSubpoints('');
    setEvaluation(null);
    setChapter('');
    setUploadedFiles([]);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleIngest = async () => {
    if (ingestFiles.length === 0) return;
    setIngesting(true);
    try {
      const result = await auditService.ingestFullSyllabus(ingestFiles);
      alert(`Successfully ingested ${result.count} questions across ${result.chapters.length} chapters!`);
      setIngestFiles([]);
    } catch (error) {
      console.error(error);
      alert('Ingestion failed. Check console.');
    } finally {
      setIngesting(false);
    }
  };

  const handleAdminFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        setIngestFiles(prev => [...prev, { data: base64, mimeType: file.type, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    if (adminFileInputRef.current) adminFileInputRef.current.value = '';
  };

  const fetchDbStats = async () => {
    setLoadingStats(true);
    try {
      const stats = await auditService.getDatabaseStats();
      setDbStats(stats);
      const all = await auditService.getAllQuestions();
      setAllQuestions(all);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSeedBaseline = async () => {
    if (!window.confirm("This will fetch RTPs/Past Papers for ALL chapters. It may take a few minutes. Continue?")) return;
    setSeeding(true);
    try {
      await auditService.seedBaseline((chapter) => setSeedProgress(chapter));
      alert("Baseline seeded successfully!");
    } catch (error) {
      console.error(error);
      alert("Seeding failed.");
    } finally {
      setSeeding(false);
      setSeedProgress('');
    }
  };

  const handleFetchQuestions = async () => {
    if (!chapter.trim()) return;
    setLoading(true);
    setEvaluation(null);
    try {
      const fetched = await auditService.fetchQuestions(chapter, uploadedFiles);
      setQuestions(fetched);
      setCurrentIndex(0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string).split(',')[1];
        setUploadedFiles(prev => [...prev, { data: base64, mimeType: file.type, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be uploaded again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setUploadedFiles([]);
  };

  const handleEvaluate = async () => {
    if (!userHeading.trim()) return;
    setEvaluating(true);
    try {
      const result = await auditService.evaluateAnswer(questions[currentIndex], userHeading, userSubpoints);
      setEvaluation(result);
    } catch (error) {
      console.error(error);
    } finally {
      setEvaluating(false);
    }
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setEvaluation(null);
      setUserHeading('');
      setUserSubpoints('');
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setEvaluation(null);
      setUserHeading('');
      setUserSubpoints('');
    }
  };

  const currentQuestion = questions[currentIndex];

  const missingKeywords = evaluation?.keywordFeedback?.filter((k: any) => !k.found) || [];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-orange-100 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-bold">A</div>
            <h1 className="text-lg font-semibold tracking-tight">CA Final Audit Master</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="hidden sm:inline">Advanced Auditing & Professional Ethics</span>
            {user ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
                <UserIcon className="w-4 h-4" />
                <span className="font-medium text-gray-700">{user.displayName || user.email}</span>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-1.5 bg-orange-600 text-white rounded-full hover:bg-orange-700 transition-all font-medium"
              >
                <LogIn className="w-4 h-4" /> Login
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {!isAuthReady ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
          </div>
        ) : !user ? (
          <div className="max-w-md mx-auto text-center space-y-6 py-20">
            <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto">
              <LogIn className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Login Required</h2>
              <p className="text-gray-500">Please login with your Google account to access the baseline question bank and save your progress.</p>
            </div>
            <button 
              onClick={handleLogin}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-200"
            >
              <LogIn className="w-5 h-5" /> Sign in with Google
            </button>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Admin Ingest Section */}
            {isAdmin && (
              <div className="bg-[#1A1A1A] text-white p-8 rounded-2xl shadow-xl space-y-6 border border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Global Baseline Ingestion</h2>
                      <p className="text-gray-400 text-sm">Sort and seed full-syllabus MTPs/RTPs into the database.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => {
                        setShowDbExplorer(!showDbExplorer);
                        if (!showDbExplorer) fetchDbStats();
                      }}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                    >
                      <Search className="w-3 h-3" />
                      {showDbExplorer ? 'Hide Explorer' : 'Explore Database'}
                    </button>
                    <button
                      onClick={handleSeedBaseline}
                      disabled={seeding}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                    >
                      {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                      {seeding ? `Seeding: ${seedProgress}` : 'Seed All RTPs/Past Papers'}
                    </button>
                  </div>
                </div>

                {showDbExplorer && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    {loadingStats ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Questions</p>
                            <p className="text-4xl font-black text-orange-500">{dbStats?.total || 0}</p>
                          </div>
                          <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Chapters</p>
                            <p className="text-4xl font-black text-white">{Object.keys(dbStats?.byChapter || {}).length}</p>
                          </div>
                          <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-2xl">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Sources</p>
                            <p className="text-4xl font-black text-white">{dbStats?.sources.length || 0}</p>
                          </div>
                        </div>

                        <div className="bg-gray-800/30 border border-gray-700 rounded-2xl overflow-hidden">
                          <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
                                <tr>
                                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Chapter</th>
                                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Source</th>
                                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Question Snippet</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-800">
                                {allQuestions.map((q) => (
                                  <tr key={q.id} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-medium text-orange-400">{q.chapterName}</td>
                                    <td className="px-6 py-4 text-sm text-gray-300">{q.source}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-[300px]">{q.text}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Action</label>
                    <button 
                      onClick={handleIngest}
                      disabled={ingesting || ingestFiles.length === 0}
                      className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-800 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {ingesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                      {ingesting ? 'Processing & Sorting...' : 'Ingest Uploaded Files'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Upload MTP Files (Questions & Answers)</label>
                  <div 
                    onClick={() => adminFileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-800 rounded-xl p-8 text-center cursor-pointer hover:border-orange-500 hover:bg-gray-800 transition-all group"
                  >
                    <Upload className="w-8 h-8 mx-auto text-gray-600 group-hover:text-orange-500 mb-2" />
                    <p className="text-sm text-gray-400 font-medium">Click to upload MTP Question Papers and Answer Keys</p>
                    <p className="text-xs text-gray-500 mt-1">Upload all 28 files at once</p>
                    <input type="file" ref={adminFileInputRef} className="hidden" multiple onChange={handleAdminFileUpload} />
                  </div>
                  {ingestFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {ingestFiles.map((f, i) => (
                        <div key={i} className="px-3 py-1 bg-gray-800 text-gray-300 text-[10px] rounded-full border border-gray-700 flex items-center gap-2">
                          <span className="truncate max-w-[150px]">{f.name}</span>
                          <button 
                            onClick={() => setIngestFiles(prev => prev.filter((_, idx) => idx !== i))}
                            className="hover:text-red-500"
                          >
                            <XCircle className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {questions.length === 0 ? (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-3">
              <h2 className="text-4xl font-bold tracking-tight text-gray-900">Master your Audit Concepts</h2>
              <p className="text-gray-500 text-lg">Practice past paper questions, RTPs, and MTPs with instant feedback.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Chapter Name</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g., Professional Ethics, Audit of Banks..."
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all outline-none"
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Upload MTPs/RTPs (Optional)</label>
                  {uploadedFiles.length > 0 && (
                    <button 
                      onClick={clearFiles}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-all group"
                >
                  <Upload className="w-8 h-8 mx-auto text-gray-400 group-hover:text-orange-500 mb-2" />
                  <p className="text-sm text-gray-500 font-medium">Click to upload files (Questions & Answers)</p>
                  <p className="text-xs text-gray-400 mt-1">You can select multiple files at once</p>
                  <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="group relative px-3 py-1 bg-orange-50 text-orange-700 text-xs rounded-full border border-orange-100 flex items-center gap-2">
                        <span className="truncate max-w-[150px]">{f.name}</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          className="hover:text-red-600 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleFetchQuestions}
                disabled={loading || !chapter}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-200"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BookOpen className="w-5 h-5" />}
                {loading ? 'Fetching Questions...' : 'Start Practice Session'}
              </button>

              <div className="bg-blue-50 p-4 rounded-xl flex gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  <strong>Tip:</strong> Since some MTPs are behind login walls, you can download them manually from the BoS portal and upload them here. I will extract the questions for you!
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            {/* Left Column: Question */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center justify-between">
                <button 
                  onClick={resetSession}
                  className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Test Another Chapter
                </button>
                <div className="text-sm font-medium text-gray-500">
                  Question {currentIndex + 1} of {questions.length}
                </div>
              </div>

              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded uppercase tracking-wider">
                      {currentQuestion.source}
                    </div>
                    {currentQuestion.isExactRepetition && (
                      <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded uppercase tracking-wider">
                        Exact Case Repeated
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-orange-600 uppercase tracking-wider bg-orange-50 px-3 py-1 rounded">
                    Tested {currentQuestion.repetitionCount}x in Past Papers/RTPs/MTPs
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold leading-tight text-gray-900">
                  {currentQuestion.text}
                </h3>
                
                <div className="space-y-6 pt-6 border-t border-gray-100">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Identify the Topic Heading</label>
                    <input
                      type="text"
                      placeholder="What is the main topic/section being tested?"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                      value={userHeading}
                      onChange={(e) => setUserHeading(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Sub-points / Keywords (Optional)</label>
                    <textarea
                      placeholder="List the key points you would include in your answer..."
                      rows={4}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-all resize-none"
                      value={userSubpoints}
                      onChange={(e) => setUserSubpoints(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={handleEvaluate}
                      disabled={evaluating || !userHeading}
                      className="flex-1 bg-[#1A1A1A] hover:bg-black disabled:bg-gray-300 text-white font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {evaluating ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                      {evaluating ? 'Evaluating...' : 'Check Answer'}
                    </button>
                    <button
                      onClick={nextQuestion}
                      disabled={currentIndex === questions.length - 1}
                      className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-gray-200"
                    >
                      Already Tested / Skip
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={prevQuestion}
                  disabled={currentIndex === 0}
                  className="p-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={nextQuestion}
                  disabled={currentIndex === questions.length - 1}
                  className="p-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-all"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Right Column: Feedback */}
            <div className="lg:col-span-5 space-y-6">
              {evaluation ? (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                  {/* Heading Evaluation */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex items-center gap-3">
                      {evaluation.headingCorrect ? (
                        <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                          <XCircle className="w-6 h-6" />
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-lg">Heading Identification</h4>
                        <p className={cn("text-sm", evaluation.headingCorrect ? "text-green-600" : "text-red-600")}>
                          {evaluation.headingCorrect ? 'Correct Topic Identified' : 'Incorrect Topic'}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100">
                      {evaluation.headingFeedback}
                    </p>
                  </div>

                  {/* Keyword Check */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold">Keyword Check</h4>
                      <button 
                        onClick={() => setShowCriteria(!showCriteria)}
                        className="text-xs text-orange-600 hover:underline flex items-center gap-1"
                      >
                        <HelpCircle className="w-3 h-3" /> Criteria
                      </button>
                    </div>

                    {showCriteria && (
                      <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-xs text-red-800 space-y-2 animate-in fade-in duration-300">
                        <h5 className="font-bold uppercase tracking-wider flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> ICAI Marking Criteria (STRICT):
                        </h5>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><strong>ZERO PARAPHRASING:</strong> Meaning similarity is NOT accepted. If the technical keyword is missing, the point is marked zero.</li>
                          <li><strong>EXACT TERMINOLOGY:</strong> You MUST use the specific technical terms as per ICAI standards (e.g., "Professional Skepticism", "Material Misstatement").</li>
                          <li><strong>TECHNICAL ACCURACY:</strong> General language or descriptive sentences without the core keywords will be marked as "Not Found".</li>
                        </ul>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {evaluation.keywordFeedback.map((kf: any, i: number) => (
                        <span 
                          key={i} 
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-all",
                            kf.found 
                              ? "bg-green-50 text-green-700 border-green-200" 
                              : "bg-gray-50 text-gray-400 border-gray-200 opacity-60"
                          )}
                        >
                          {kf.found ? <CheckCircle className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-gray-300" />}
                          {kf.keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Missing Keywords */}
                  {missingKeywords.length > 0 && (
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-100 space-y-3">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertCircle className="w-5 h-5" />
                        <h4 className="font-bold">Missing Keywords</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {missingKeywords.map((mk: any, i: number) => (
                          <span key={i} className="px-2 py-1 bg-white text-red-600 text-xs font-semibold rounded border border-red-200">
                            {mk.keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Answer with Bolding */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h4 className="font-bold">Suggested Answer (ICAI Standard)</h4>
                    <div className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100 prose prose-sm max-w-none">
                      <ReactMarkdown>{evaluation.boldedSuggestedAnswer}</ReactMarkdown>
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                      * Bolded parts represent content missing or not fully addressed in your response.
                    </p>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-3">
                    <h4 className="font-bold">Overall Feedback</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {evaluation.overallFeedback}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={nextQuestion}
                      disabled={currentIndex === questions.length - 1}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-100"
                    >
                      Next Question <ArrowRight className="w-5 h-5" />
                    </button>
                    <button
                      onClick={resetSession}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-gray-200"
                    >
                      Test Another Chapter
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full min-h-[400px] bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-gray-300">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-bold text-gray-400">Evaluation Pending</h4>
                      <p className="text-sm text-gray-400">Submit your answer to see the analysis and keyword check.</p>
                    </div>
                    <button
                      onClick={resetSession}
                      className="px-6 py-2 bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium transition-all"
                    >
                      Test Another Chapter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}
  </main>
</div>
  );
}
