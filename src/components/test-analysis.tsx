import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Clock, 
  CheckCircle, 
  XCircle,
  BarChart3,
  PieChart,
  Lightbulb,
  BookOpen
} from "lucide-react";
import type { TestAttempt } from "@/types/practice-tests";

interface TestAnalysisProps {
  attempt: TestAttempt;
  aiAnalysis?: {
    overallAnalysis: string;
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
}

export default function TestAnalysis({ attempt, aiAnalysis }: TestAnalysisProps) {
  const accuracy = Math.round((attempt.score / attempt.totalQuestions) * 100);
  const timePerQuestion = attempt.timeSpent ? Math.round(attempt.timeSpent / attempt.totalQuestions) : 0;

  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-600 bg-green-100";
    if (percentage >= 50) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getPerformanceIcon = (percentage: number) => {
    return percentage >= 50 ? 
      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" /> : 
      <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />;
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Overall Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Target className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Overall Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:p-4 lg:p-6">
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                {attempt.score}/{attempt.totalQuestions}
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Score</p>
            </div>
            
            <div className="text-center">
              <div className={`text-2xl sm:text-3xl font-bold mb-1 ${accuracy >= 75 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                {accuracy}%
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Accuracy</p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                {Math.floor((attempt.timeSpent || 0) / 60)}m
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Time Taken</p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
                {timePerQuestion}s
              </div>
              <p className="text-xs sm:text-sm text-gray-600">Per Question</p>
            </div>
          </div>

          {aiAnalysis && (
            <>
              <Separator className="my-6" />
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2 flex items-center">
                  <Lightbulb className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  AI Analysis
                </h4>
                <p className="text-xs sm:text-sm text-blue-800">{aiAnalysis.overallAnalysis}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detailed Analysis Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="subjects" className="w-full">
            <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 rounded-none border-b">
              <TabsTrigger value="subjects" className="flex items-center">
                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Subjects
              </TabsTrigger>
              <TabsTrigger value="topics" className="flex items-center">
                <PieChart className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Topics
              </TabsTrigger>
              <TabsTrigger value="timing" className="flex items-center">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Timing
              </TabsTrigger>
              <TabsTrigger value="recommendations" className="flex items-center">
                <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Recommendations
              </TabsTrigger>
            </TabsList>

            <div className="p-3 sm:p-4 lg:p-6">
              <TabsContent value="subjects" className="mt-0">
                <div className="space-y-4">
                  <h3 className="font-semibold text-base sm:text-lg">Subject-wise Performance</h3>
                  {attempt.analysis?.subjectWise.map((subject, index) => {
                    const percentage = Math.round((subject.correct / subject.total) * 100);
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Subject {subject.subjectId}</span>
                          <div className="flex items-center space-x-2">
                            <Badge className={getPerformanceColor(percentage)}>
                              {getPerformanceIcon(percentage)}
                              {percentage}%
                            </Badge>
                            <span className="text-xs sm:text-sm text-gray-600">
                              {subject.correct}/{subject.total}
                            </span>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="topics" className="mt-0">
                <div className="space-y-4">
                  <h3 className="font-semibold text-base sm:text-lg">Topic-wise Performance</h3>
                  {attempt.analysis?.topicWise.map((topic, index) => {
                    const percentage = Math.round((topic.correct / topic.total) * 100);
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Topic {topic.topicId}</span>
                          <div className="flex items-center space-x-2">
                            <Badge className={getPerformanceColor(percentage)}>
                              {getPerformanceIcon(percentage)}
                              {percentage}%
                            </Badge>
                            <span className="text-xs sm:text-sm text-gray-600">
                              {topic.correct}/{topic.total}
                            </span>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="timing" className="mt-0">
                <div className="space-y-4">
                  <h3 className="font-semibold text-base sm:text-lg">Time Analysis</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Clock className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 mx-auto mb-2 text-blue-600" />
                        <div className="text-xl sm:text-2xl font-bold text-gray-900">
                          {Math.floor((attempt.timeSpent || 0) / 60)}m {((attempt.timeSpent || 0) % 60)}s
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600">Total Time</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardContent className="p-4 text-center">
                        <Target className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 mx-auto mb-2 text-green-600" />
                        <div className="text-xl sm:text-2xl font-bold text-gray-900">
                          {timePerQuestion}s
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600">Avg per Question</p>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 mx-auto mb-2 text-purple-600" />
                        <div className="text-xl sm:text-2xl font-bold text-gray-900">
                          {attempt.responses?.length || 0}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600">Questions Attempted</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Time distribution would go here */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Time Distribution</h4>
                    <p className="text-xs sm:text-sm text-gray-600">
                      Detailed timing analysis per question would be displayed here.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="recommendations" className="mt-0">
                {aiAnalysis ? (
                  <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-green-800 mb-3 flex items-center">
                        <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                        Strengths
                      </h3>
                      <ul className="space-y-2">
                        {aiAnalysis.strengths.map((strength, index) => (
                          <li key={index} className="flex items-start">
                            <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-xs sm:text-sm">{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-red-800 mb-3 flex items-center">
                        <XCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                        Areas for Improvement
                      </h3>
                      <ul className="space-y-2">
                        {aiAnalysis.weaknesses.map((weakness, index) => (
                          <li key={index} className="flex items-start">
                            <XCircle className="w-3 h-3 sm:w-4 sm:h-4 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-xs sm:text-sm">{weakness}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-blue-800 mb-3 flex items-center">
                        <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                        Recommendations
                      </h3>
                      <ul className="space-y-2">
                        {aiAnalysis.recommendations.map((recommendation, index) => (
                          <li key={index} className="flex items-start">
                            <Lightbulb className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-xs sm:text-sm">{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 sm:py-6 lg:py-8">
                    <BookOpen className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-600">AI analysis not available for this test.</p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
