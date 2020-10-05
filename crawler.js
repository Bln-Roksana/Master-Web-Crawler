const cheerio = require('cheerio');
const URL = require('url-parse');
const Nightmare = require('nightmare');
const fetch = require("node-fetch");
const mysql =require('mysql2/promise');
const download = require('image-downloader')
let allRecipesLinks=[];
let allCategoriesLinks=[];
let allIngredients=[];
let uniqueIngredients=[];
let quantityList=[];
let unitList=[];
let time_prep;
let cusine;
let title;
let photoPath;
let photoOptions;
let instruction;
let counter;

counter=0;
const nightmare=Nightmare({show: true});
const allCategories="your website here";

let connection;
async function connectToDb() {
    connection = await mysql.createConnection({host:'xxx', user: 'xxx', password: 'xxx', database: 'xxx'});
    console.log("Connected to MySQL XXXDB");
}
connectToDb();

async function getTheCategories(){
    nightmare.goto(allCategories);

    while (await nightmare.exists("span[class='G8cbdae G8aa691 Gefef6b G5153a3 G6576ff Gd71c60 G42bbcd']")){
        await nightmare.click("span[class='G8cbdae G8aa691 Gefef6b G5153a3 G6576ff Gd71c60 G42bbcd']");
        //nightmare.wait(1000);
        //console.log("Category: I clicked Load More ");
    }

    //what do I want to do with this stuff?
    nightmare.evaluate(() => document.querySelector('body').innerHTML)
    //end of me doing stuff

    //nightmare.end();
    await nightmare.then(res => {
        readBodyCategory(res)});
}


async function hellLoop(oneCategoryLink) {
    console.log("I am inside", oneCategoryLink);
    nightmare.goto(oneCategoryLink);
    while (await nightmare.exists("span[class='Gb69063 Gdcadba']")){
        await nightmare.click("span[class='Gb69063 Gdcadba']");
        //nightmare.wait(1000);
        //console.log("I clicked Load More ");
    }

    //what do I want to do with this stuff?
    nightmare.evaluate(() => document.querySelector('body').innerHTML)
    //end of me doing stuff

    //nightmare.end();
    await nightmare.then(res => {
        readBody(res)});
};

async function fetchIngredients(){

    Promise.all(allRecipesLinks.map(url => fetch(url)))
        .then(promiseRes=> Promise.all(promiseRes.map(res =>res.text()) ))
        .then(responses=> {
            responses.forEach(data => {
                const body=data;
                var $ =cheerio.load(body);
                collectIngredients($);
                console.log("This is title: ", title);
            })

        })
        .catch(error=>console.log(error))
};

async function runTheHell(){
    await getTheCategories();
    for (category of allCategoriesLinks ){
        await hellLoop(category)
        await fetchIngredients();
    };
    nightmare.end()

}

runTheHell();

let readBodyCategory = html => {
    var $ =cheerio.load(html);
    collectCategoriesLinks($);
    console.log("allCategoriesLinks:", allCategoriesLinks);
}

let readBody = html => {
    var $ =cheerio.load(html);
    collectRecipesLinks($);
    console.log("allRecipesLinks:", allRecipesLinks);
}

function collectCategoriesLinks($){
    let categoriesLinks = $("a[href^='/your param here/']");
    categoriesLinks.each((index, link ) => {
        allCategoriesLinks.push("Your url here"+$(link).attr('href'));
    });
    allCategoriesLinks.shift();
    //TODELETE here
    allCategoriesLinks=allCategoriesLinks.slice(0,2);
};

function collectRecipesLinks($){
    allRecipesLinks=[];
    let recipesLinks = $("a[href^='Your url here']");
    recipesLinks.each((index, link ) => {
        allRecipesLinks.push($(link).attr('href'));
    });

    //TODELETE here
    allRecipesLinks=allRecipesLinks.slice(0,5);
};


function collectIngredients($){
    title = $("h1[class='indivrecipe-title']").text();

    let extra_info=[];
    let time_cusine = $("p[class='recipehighlight-box-value']") //there should be 4 of those
    time_cusine.each((index, item) =>{
        var item=$(item).text();
        extra_info.push(item);
    });

    time_prep=extra_info[0];
    time_prep=time_prep.replace('min','');
    cusine=extra_info[1];

    photoPath = $(".content source")[1].attribs['data-srcset'];
    photoOptions = {
        url: photoPath,
        dest: './SQL/img/'+ title +'.png'
    }

    instruction=$("div[class='col-sm-7 col-xs-12 indivrecipe-panel-wrapper']").text();
    instruction = instruction.replace(/\t/g,'');
    instruction = instruction.replace(/\n+/g,'\n');
    const offendingStr="\nShare blablabla cooking";
    instruction=instruction.replace(offendingStr,'');
    
    allIngredients=[];
    let ingredients = $("figcaption[class='indivrecipe-ingredients-text']");
    ingredients.each((index, ingredient) => {
        var unformattedIngredient=$(ingredient).text();
        var cleanIngredient = unformattedIngredient.trim();
        var slicedIngredient = cleanIngredient.split(/\s+/);
        allIngredients.push(slicedIngredient);
    });
    createUniqueIngredients();
};

function createUniqueIngredients(){

    uniqueIngredients=[];
    for (var a=0; a<allIngredients.length; a++){
        let entry=allIngredients[a];
        let interimTable=[];
        for (var index=0; index<entry.length;){
            let word=entry[index];

            if (word==='1/2') {
                entry[index]=String(eval(word));
                word=String(eval(word));
            }

            if(word==='†' ||word==='x'){
                entry.splice(index, 1); 
                continue; // not adding to unique ingredient and will keep same index
            }

            if (isNaN(word)===false && word>1){ // if its a number

                for (var i=0; i<entry.length; i++){
                    if(entry[i].substr(-1)==='s'){ //if the last letter is s
                        entry[i]=entry[i].slice(0, -1) //then get rid of it
                        break; // break from the loop if s found
                    }
                }               
            }
            if(word==='1'){
                if(isNaN(entry[index+1].substr(0,1))===false){
                    entry.splice(index,1);
                    continue; // index stays the same
                }
            }
            interimTable.push(word);
            index++;
        }
        uniqueIngredients.push(interimTable);
    }

    uniqueIngredients=uniqueIngredients.map(entry => {
        entry.shift();
        return [entry.join(' ')]
    });

    getQuantitiesAndUnits();
    shoveIntoDb(title, time_prep, cusine, photoOptions, uniqueIngredients, instruction, quantityList, unitList);
};

function getQuantitiesAndUnits(){

    unitList=[];
    unitList=allIngredients.map(entry => {
        let firstElement=entry.shift();
        if(firstElement.substr(-1)==='l'){
            return [firstElement.substr(0, firstElement.length-2),firstElement.substr(firstElement.length-2,2)]
        }else if(firstElement.substr(-1)==='g'){
            return [firstElement.substr(0, firstElement.length-1),firstElement.substr(firstElement.length-1,1)]    
        }else {return [firstElement,""];}
    });  

    quantityList=[];
    quantityList=unitList.map(entry =>{
        let firstElement=entry.shift();
        return [firstElement];
    })

};


async function shoveIntoDb(title, time_prep, cusine, photoOptions, uniqueIngredients, instruction, quantityList, unitList){
    let recipeID; // for insert id
    let ingredientID;
    let recipe={recipe_name: title, dish_pic_path: photoOptions.dest, time_min: time_prep, cusine: cusine};

    try{
        let queryRecipes = await connection.query('INSERT IGNORE INTO recipes SET ?', recipe)
        recipeID = queryRecipes[0].insertId;
         
        //if recipeID is other than 0 then I already have it, SKIP!
        if(recipeID!=0){

            download.image(photoOptions)
            .then(({ filename }) => {
              //console.log('Saved to', filename) 
            })
            .catch((err) => console.error(err))

            await connection.query('INSERT IGNORE INTO ingredients(ingredient_name) VALUES ?', [uniqueIngredients])

            let instructions={recipe_index: recipeID, instructions: instruction};
            await connection.query('INSERT INTO instructions SET ?', instructions)

            for (var ing=0; ing<uniqueIngredients.length; ing++){
                var oneIngredient=uniqueIngredients[ing];

                let queryIngredient= await connection.query('SELECT ingredient_index FROM ingredients WHERE ingredient_name = ?',oneIngredient)
                ingredientID=queryIngredient[0][0].ingredient_index;
                //console.log("Logging id: ",ingredientID);

                let quantity={recipe_index: recipeID, ingredient_index: ingredientID, quantity: quantityList[ing], unit: unitList[ing] }
                await connection.query('INSERT INTO quantities SET ?', quantity) // IGNORE not here as I have recipeID!=0 statement


            }
            counter++;
            console.log("Recipe ", counter, " inserted.");
        }        
    }
    
    catch(e){
        console.log(e);
    }

    //console.log("Recipe inserted at id: ", recipeID, "!");

    // connection.end();
}






