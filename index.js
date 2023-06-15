const readline = require("readline");
const fs = require("fs");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  if (fs.existsSync("./login.json")) {
    var options = await askNewLogin();
  } else {
    var options = await getPrompts();
  }
  let instance = options.instance;

  let loginForm = {
    username_or_email: options.username,
    password: options.password,
  };
  const baseURL = `https://${instance}/api/v3`;
  console.log("Logging in...");
  var auth = await getJwt(baseURL, loginForm);
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

async function getPrompts() {
  return new Promise((resolve) => {
    let options = {};
    rl.question("Please enter an instance you want to log into (eg. lemmy.ml, lemmy.world, beehaw.org, etc.):\n", (instance) => {
      rl.question("Please enter your username:\n", (username) => {
        rl.question("Please enter your password:\n", (password) => {
          rl.question("Would you like me to remember your login? (y/n)\n", async (boolean) => {
            rl.question("What community would you like to search?\n", async (community) => {
              rl.question("What comment would you like to search?\n", async (comment) => {
                options.instance = instance;
                options.username = username;
                options.password = password;
                options.comment = comment;
                options.community = comment;

                let nos = ["yes", "y"];
                if (nos.some((char) => char.toLowerCase() === boolean.toLowerCase())) {
                  let jsonData = JSON.stringify(options, null, 2);
                  await fs.promises.writeFile("login.json", jsonData);
                }
                resolve(options);
              });
            });
          });
        });
      });
    });
  });
}

async function askNewLogin() {
  return new Promise((resolve) => {
    rl.question("It seems like there's already a login, would you like log in with that account? (y/n)\n", async (boolean) => {
      let nos = ["no", "n"];
      if (nos.some((char) => char.toLowerCase() === boolean.toLowerCase())) {
        let options = await getPrompts();
        resolve(options);
        return;
      }
      rl.question("What community would you like to search in?\n", async (community) => {
        rl.question("What comment would you like to search?\n", async (comment) => {
          let yes = ["yes", "y"];
          if (yes.some((char) => char.toLowerCase() === boolean.toLowerCase())) {
            let login = await fs.promises.readFile("./login.json", "utf-8");
            let loginJSON = JSON.parse(login);
            loginJSON.comment = comment;
            loginJSON.community = community;
            resolve(loginJSON);
            return;
          }
        });
      });
    });
  });
}

async function getJwt(baseURL, form) {
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
