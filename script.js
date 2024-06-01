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

