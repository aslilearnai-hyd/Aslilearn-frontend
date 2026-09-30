import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle, Target } from 'lucide-react';

interface Question {
  id?: number;
  _id?: string;
  question?: string;
  questionText?: string;
  questionType?: 'mcq' | 'multiple' | 'integer';
  options?: string[] | Array<{ text: string; _id?: string }>;
  correctAnswer: string | string[];
  userAnswer: string | string[];
  explanation?: string;
}

interface DetailedExamViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTitle: string;
  questions: Question[];
}

export default function DetailedExamViewModal({ 
  isOpen, 
  onClose, 
  examTitle, 
  questions 
}: DetailedExamViewModalProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Helper function to extract text from option objects
  const getOptionText = (option: any): string => {
    if (option === null || option === undefined) return '';
    if (typeof option === 'string') return option;
    if (typeof option === 'number') return String(option);
    if (typeof option === 'object' && option !== null) {
      if (option.text !== undefined) return String(option.text);
      if (option.label !== undefined) return String(option.label);
      if (option.value !== undefined) return String(option.value);
      if (option._id !== undefined) return String(option._id);
      if (Array.isArray(option)) return option.map(getOptionText).join(', ');
      return JSON.stringify(option);
    }
    return String(option);
  };

  // Helper function to check if user answer matches correct answer
  const compareAnswers = (userAnswer: any, correctAnswer: any): boolean => {
    if (!userAnswer) return false;
    
    const userText = getOptionText(userAnswer);
    const correctText = getOptionText(correctAnswer);
    
    if (Array.isArray(correctAnswer) && Array.isArray(userAnswer)) {
      const userTexts = userAnswer.map(getOptionText).sort((a, b) => a.localeCompare(b));
      const correctTexts = correctAnswer.map(getOptionText).sort((a, b) => a.localeCompare(b));
      return JSON.stringify(userTexts) === JSON.stringify(correctTexts);
    }
    
    return userText === correctText;
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentQuestionIndex];
  const questionText = currentQuestion.questionText || currentQuestion.question || '';
  const questionOptions = currentQuestion.options || [];
  const correctAnswer = currentQuestion.correctAnswer;
  const userAnswer = currentQuestion.userAnswer;
  
  const isCorrect = compareAnswers(userAnswer, correctAnswer);
  const isAttempted = userAnswer !== undefined && userAnswer !== null && 
                      (Array.isArray(userAnswer) ? userAnswer.length > 0 : String(userAnswer).trim() !== '');

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const getOptionLetter = (index: number) => String.fromCharCode(65 + index);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Dark blurred background overlay */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal content */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3 sm:p-4 lg:p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">{examTitle}</h2>
              <p className="text-blue-100 mt-1">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
            </button>
          </div>
        </div>

        {/* Question content - scrollable */}
        <div className="p-3 sm:p-4 lg:p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Question text */}
          <div className="mb-6">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">
              {questionText}
            </h3>
          </div>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {questionOptions.map((option, index) => {
              const optionLetter = getOptionLetter(index);
              const optionText = getOptionText(option);
              
              // Check if this option is in user's answer (handles both single and multiple)
              const isUserAnswer = Array.isArray(userAnswer) 
                ? userAnswer.some(a => getOptionText(a) === optionText)
                : getOptionText(userAnswer) === optionText;
              
              // Check if this option is correct (handles both single and multiple)
              const isCorrectAnswer = Array.isArray(correctAnswer)
                ? correctAnswer.some(a => getOptionText(a) === optionText)
                : getOptionText(correctAnswer) === optionText;
              
              let optionStyle = "border-2 border-gray-200 bg-white";
              let textStyle = "text-gray-700";
              let icon = null;

              if (isUserAnswer && isCorrectAnswer) {
                // User got it right
                optionStyle = "border-2 border-green-500 bg-green-50";
                textStyle = "text-green-700 font-semibold";
                icon = <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />;
              } else if (isUserAnswer && !isCorrectAnswer) {
                // User got it wrong
                optionStyle = "border-2 border-red-500 bg-red-50";
                textStyle = "text-red-700 font-semibold";
                icon = <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />;
              } else if (isCorrectAnswer) {
                // Correct answer (not selected by user)
                optionStyle = "border-2 border-green-300 bg-green-25";
                textStyle = "text-green-600";
              }

              return (
                <div
                  key={index}
                  className={`p-4 rounded-lg transition-all duration-200 ${optionStyle}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center font-semibold ${
                        isUserAnswer && isCorrectAnswer ? 'bg-green-500 text-white' :
                        isUserAnswer ? 'bg-red-500 text-white' :
                        isCorrectAnswer ? 'bg-green-300 text-green-700' :
                        'bg-gray-200 text-gray-600'
                      }`}>
                        {optionLetter}
                      </div>
                      <span className={textStyle}>{optionText}</span>
                    </div>
                    {icon}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Answer summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* User's answer */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
                <Target className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Your Answer
              </h4>
              <div className="text-blue-700">
                {isAttempted ? (
                  <span className="font-medium">
                    {Array.isArray(userAnswer) 
                      ? userAnswer.map(getOptionText).join(', ')
                      : getOptionText(userAnswer)}
                  </span>
                ) : (
                  <span className="italic text-gray-500 flex items-center">
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                    Not attempted
                  </span>
                )}
              </div>
            </div>

            {/* Correct answer */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-2 flex items-center">
                <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Correct Answer
              </h4>
              <div className="text-green-700 font-medium">
                {Array.isArray(correctAnswer) 
                  ? correctAnswer.map(getOptionText).join(', ')
                  : getOptionText(correctAnswer)}
              </div>
            </div>
          </div>

          {/* Explanation */}
          {currentQuestion.explanation && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
                <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Explanation
              </h4>
              <p className="text-gray-700">{currentQuestion.explanation}</p>
            </div>
          )}
        </div>

        {/* Navigation footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-3 sm:p-4 lg:p-6">
          <div className="flex justify-between items-center">
            <button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                currentQuestionIndex === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 hover:border-gray-400'
              }`}
            >
              <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Previous Question</span>
            </button>

            <div className="flex space-x-2">
              {questions.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`w-3 h-3 rounded-full transition-all duration-200 ${
                    index === currentQuestionIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              disabled={currentQuestionIndex === questions.length - 1}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                currentQuestionIndex === questions.length - 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 hover:border-gray-400'
              }`}
            >
              <span>Next Question</span>
              <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}




