const readline = require("readline");
const { promisify } = require("util");
const fs = require("fs");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  if (fs.existsSync("./login.json")) {
    var options = await loggedIn();
  } else {
    var options = await newLogin();
  }

  let instance = options.instance;

  let loginForm = {
    username_or_email: options.username,
    password: options.password,
  };
  const baseURL = `https://${instance}/api/v3`;
  console.log("Logging in...");
  var auth = await getToken(baseURL, loginForm);
  if (!auth || !auth.status) {
    console.log("ERROR: Invalid credentials were submitted, quitting.");
    if (fs.existsSync("./login.json")) {
      await fs.promises.rm("./login.json");
    }
    return;
  }
  console.log("Logged in, fetching comments.");

  const communityForm = {
    auth,
    name: options.community,
  };
  const community = await getCommunity(baseURL, communityForm);
  if (community.error === "couldnt_find_community") {
    console.log("Couldn't find that Community! If the community you're looking for was created in another instance, you should search for it like: \"community@instance.xyz\"");
    return;
  }
  const community_id = community.community_view.community.id;

  let limit = 100;
  let page = 1;
  let foundComments = [];
  do {
    if (page > 50) {
      console.log(`Reached page ${page}. Exiting...`);
      break;
    }
    let commentsForm = {
      auth,
      community_id,
      limit,
      page,
    };
    let comments = await getComments(baseURL, commentsForm);

    let searchingFor = options.comment;
    let commentsMatched = search(comments, searchingFor);
    if (!commentsMatched) {
      break;
    }
    foundComments.push(...commentsMatched);
    if (page % 10 === 0) {
      console.log(`Searched ${100 * page} comments, continuing...`);
    }
    page++;
  } while (true);
  if (foundComments.length === 0) {
    console.log("No comments were found that matched the criteria.");
    return;
  }
  for (comment of foundComments) {
    console.log({ content: comment.content, published: comment.published, link: comment.ap_id }, "\n");
  }
}

const question = promisify(rl.question).bind(rl);

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const removeFile = promisify(fs.rm);

async function askQuestion(questionText) {
  return await question(questionText + "\n");
}

async function newLogin() {
  const options = {};
  options.instance = await askQuestion("Please enter an instance you want to log into (eg. lemmy.ml, lemmy.world, beehaw.org, etc.):");
  options.username = await askQuestion("Please enter your username:");
  options.password = await askQuestion("Please enter your password:");

  const remember = await askQuestion("\x1b[33Would 3myou like me to remember your login?\x1b[33m \x1b[31m(y/n)\x1b[31m \x1b[0m");
  const shouldRemember = remember.toLowerCase().startsWith("y");
  if (shouldRemember) {
    const jsonData = JSON.stringify(options, null, 2);
    await writeFile("login.json", jsonData);
  }

  options.comment = await askQuestion("What community would you like to search?");
  options.community = await askQuestion("What comment would you like to search?");

  return options;
}

async function loggedIn() {
  const loginPrompt = await askQuestion('It seems like there\'s already a login, \x1b[33mwould you like to log in with that account?\x1b[33m \x1b[31m(y/n)\x1b[31m \x1b[0m\nTo log out, type "logout"');
  const shouldLogin = loginPrompt.toLowerCase().startsWith("y");
  const shouldLogout = loginPrompt.toLowerCase().includes("log");
  if (shouldLogout) {
    console.log("\x1b[1m\x1b[33mLogging out...\x1b[33m\x1b[1m \x1b[0m");
    await removeFile("./login.json");
    return newLogin();
  }

  if (shouldLogin) {
    const login = await readFile("./login.json", "utf-8");
    const loginJSON = JSON.parse(login);
    loginJSON.comment = await askQuestion("What community would you like to search?");
    loginJSON.community = await askQuestion("What comment would you like to search?");
    return loginJSON;
  }
  return await newLogin();
}
async function getToken(baseURL, form) {
  try {
    var jwt = await fetch(`${baseURL}/user/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    })
      .then((res) => res.json())
      .then((json) => json.jwt);
    return jwt;
  } catch (err) {
    return { status: false, err };
  }
}
async function getCommunity(baseURL, form) {
  const queryParams = new URLSearchParams(form);
  return await fetch(`${baseURL}/community?${queryParams}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  }).then((res) => res.json());
}
async function getComments(baseURL, form) {
  const queryParams = new URLSearchParams(form);
  return await fetch(`${baseURL}/comment/list?${queryParams}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((res) => res.json())
    .then((json) => json.comments);
}
function search(comments, searchingFor) {
  if (comments.length === 0) {
    return null;
  }
  let matchedComments = [];
  for (obj of comments) {
    let comment = obj.comment;
    if (comment.content.includes(searchingFor)) {
      matchedComments.push(comment);
    }
  }
  return matchedComments;
}

main();
