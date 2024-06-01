// let js = 'amazing'
// if (js=='amazing') {
//     alert('Javascript is fun ')
    
// } else {
//     alert('Javascript is boring ')
    
// }
console.log(10+50-2);
let firstName='Felex';
console.log(firstName);

/*JavaScript Fundamentals – Part 1
Coding Challenge #1
Mark and John are trying to compare their BMI (Body Mass Index), which is
calculated using the formula:
BMI = mass / height ** 2 = mass / (height * height) (mass in kg
and height in meter).
Your tasks:
1. Store Mark's and John's mass and height in variables
2. Calculate both their BMIs using the formula (you can even implement both
versions)
3. Create a Boolean variable 'markHigherBMI' containing information about
whether Mark has a higher BMI than John.
Test data:
§ Data 1: Marks weights 78 kg and is 1.69 m tall. John weights 92 kg and is 1.95
m tall.
§ Data 2: Marks weights 95 kg and is 1.88 m tall. John weights 85 kg and is 1.76 */

const markWeight=78;
const markHeight=1.69;
const johnWeight=92;
const johnHeight=1.95



//calculate BMI
let markBMI=markWeight/(markHeight*markHeight)
let johnBMI=johnWeight/(johnHeight*johnHeight)
let markHigherBMI=markBMI>johnBMI

//control stucture
if (markHigherBMI) {
    console.log(`Mark's BMI ${markBMI.toFixed(2)} is higher than John's ${johnBMI.toFixed(2)}!`)
} else {
    console.log("John's BMI", johnBMI ,"is higher than Mark's!" ,markBMI)
    
}
 console.log(markBMI.toFixed(2),johnBMI.toFixed(2),markHigherBMI)

/*Coding Challenge #3
There are two gymnastics teams, Dolphins and Koalas. They compete against each
other 3 times. The winner with the highest average score wins a trophy!
Your tasks:
1. Calculate the average score for each team, using the test data below
2. Compare the team's average scores to determine the winner of the competition,
and print it to the console. Don't forget that there can be a draw, so test for that
as well (draw means they have the same average score)
3. Bonus 1: Include a requirement for a minimum score of 100. With this rule, a
team only wins if it has a higher score than the other team, and the same time a
score of at least 100 points. Hint: Use a logical operator to test for minimum
score, as well as multiple else-if blocks �
4. Bonus 2: Minimum score also applies to a draw! So a draw only happens when
both teams have the same score and both have a score greater or equal 100
points. Otherwise, no team wins the trophy
Test data:
§ Data 1: Dolphins score 96, 108 and 89. Koalas score 88, 91 and 110
§ Data Bonus 1: Dolphins score 97, 112 and 101. Koalas score 109, 95 and 123
§ Data Bonus 2: Dolphins score 97, 112 and 101. Koalas score 109, 95 and 106
GOOD LUCK �
*/

const dolphinsScore=[96,108,89]
const koalasScore=[88,91,110]

 for (let index = 0; index < dolphinsScore.length; index++) {
    const dolphinsScoreSingle=dolphinsScore[index];
    index=0;
 dolphinsScore.map(()=>{})

    //const dolphinsScoreAverage=(dolphinsScore[0]+dolphinsScore[1]+dolphinsScore[2])/dolphinsScore.length
    //console.log(dolphinsScoreSingle.forEach((number)=>{number+1}))
    
 }

 // Function to calculate the average score
function calculateAverage(score1, score2, score3) {
    return (score1 + score2 + score3) / 3;
}

// Data 1
const dolphinsScores1 = [96, 108, 89];
const koalasScores1 = [88, 91, 110];

// Data Bonus 1
const dolphinsScoresBonus1 = [97, 112, 101];
const koalasScoresBonus1 = [109, 95, 123];

// Data Bonus 2
const dolphinsScoresBonus2 = [97, 112, 101];
const koalasScoresBonus2 = [109, 95, 106];

// Function to determine the winner
function determineWinner(dolphinsScores, koalasScores) {
    const avgDolphins = calculateAverage(...dolphinsScores);
    const avgKoalas = calculateAverage(...koalasScores);

    if (avgDolphins >= 100 && avgKoalas >= 100) {
        if (avgDolphins > avgKoalas) {
            console.log('Dolphins win the trophy!');
        } else if (avgKoalas > avgDolphins) {
            console.log('Koalas win the trophy!');
        } else {
            console.log('It is a draw!');
        }
    } else if (avgDolphins >= 100) {
        console.log('Dolphins win the trophy!');
    } else if (avgKoalas >= 100) {
        console.log('Koalas win the trophy!');
    } else {
        console.log('No team wins the trophy!');
    }
}

// Test with Data 1
console.log('Data 1 Results:');
determineWinner(dolphinsScores1, koalasScores1);

// Test with Data Bonus 1
console.log('Data Bonus 1 Results:');
determineWinner(dolphinsScoresBonus1, koalasScoresBonus1);

// Test with Data Bonus 2
console.log('Data Bonus 2 Results:');
determineWinner(dolphinsScoresBonus2, koalasScoresBonus2);
