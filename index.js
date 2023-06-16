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

async function newLogin() {
  let options = {};
  options.instance = await question("Please enter an instance you want to log into (eg. lemmy.ml, lemmy.world, beehaw.org, etc.):\n");
  options.username = await question("Please enter your username:\n");
  options.password = await question("Please enter your password:\n");

  let remember = await question("Would you like me to remember your login? (y/n)\n");
  let nos = ["yes", "y"];
  if (nos.some((char) => char.toLowerCase() === remember.toLowerCase())) {
    let jsonData = JSON.stringify(options, null, 2);
    await fs.promises.writeFile("login.json", jsonData);
  }

  options.comment = await question("What community would you like to search?\n");
  options.community = await question("What comment would you like to search?\n");

  return options;
}

async function loggedIn() {
  let loginBool = await question("It seems like there's already a login, would you like log in with that account? (y/n)\n");
  let nos = ["no", "n"];
  if (nos.some((char) => char.toLowerCase() === loginBool.toLowerCase())) {
    let options = await newLogin();
    return options;
  }

  let login = await fs.promises.readFile("./login.json", "utf-8");
  let loginJSON = JSON.parse(login);
  loginJSON.comment = await question("What community would you like to search?\n");
  loginJSON.community = await question("What comment would you like to search?\n");
  return loginJSON;
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
