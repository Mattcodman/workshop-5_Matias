import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import * as console from "console";
import { delay } from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  type NodeState = {
    killed: boolean; // this is used to know if the node was stopped by the /stop route. It's important for the unit tests but not very relevant for the Ben-Or implementation
    x: 0 | 1 | "?" | null; // the current consensus value
    decided: boolean | null; // used to know if the node reached finality
    k: number | null; // current step of the node
  };

  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  let currentNodeState: NodeState = {
    killed: false,
    x: initialValue,
    decided: null,
    k: null
  };

  // TODO implement this
  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {

    if(isFaulty==true)
    {
      res.status(500).send('faulty');
    }
    else
    {
      res.status(200).send('live');
    }

  });


  node.get("/getState", (req, res) => {
    res.status(200).send({
      killed: currentNodeState.killed,
      x: currentNodeState.x,
      decided: currentNodeState.decided,
      k: currentNodeState.k,
    });
  });


  node.get("/stop", (req, res) => {
    currentNodeState.killed = true;
    res.status(200).send("killed");
  });



  // TODO implement this
  // this route allows the node to receive messages from other nodes
  // node.post("/message", (req, res) => {});




  let testcounter=0;

  node.post("/message", async (req, res) => {
    let { k, x, messageType } = req.body;
    if (!isFaulty && !currentNodeState.killed) {
      if (messageType === "propose") {
        if (!proposals.has(k)) {
          proposals.set(k,[]);
          testcounter++;
        }
        proposals.get(k)!.push(x);
        let proposal = proposals.get(k)!;


        if (proposal.length >= N - F) {

        let count0 = proposal.filter((el) => el === 0).length;
        let count1 = proposal.filter((el) => el === 1).length;
        if (count0 > N / 2) {
          x = 0;
        } else if (count1 > N / 2) {
          x = 1;
        } else {
          x = "?";
        }
          let test2=0;
          const sendMessage = (port: number, data: { k: string, x: string, messageType: string }) => {
            fetch(`http://localhost:${port}/message`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(data),
            });
          };


          for (let i = 0; i < N; i++) {
            sendMessage(BASE_NODE_PORT + i, { k: k, x: x, messageType: "vote" });
            test2++;
          }
          console.log(test2);


        }
      }


      else if (messageType === "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);

        }
        votes.get(k)!.push(x);
        let vote = votes.get(k)!;
        if (vote.length >= N - F) {
          console.log("vote", vote, "node :", nodeId, "k :", k);
          let count0 = vote.filter((el) => el === 0).length;
          let count1 = vote.filter((el) => el === 1).length;

          if (count0 >= F + 1) {
            currentNodeState.x = 0;
            currentNodeState.decided = true;
          } else if (count1 >= F + 1) {

            currentNodeState.x = 1;
            currentNodeState.decided = true;
          } else {
            const isCount0GreaterThanCount1 = count0 > count1;
            const isCount0EqualToCount1 = count0 === count1;


            if (count0 + count1 > 0) {
              currentNodeState.x = isCount0GreaterThanCount1 ? 0 : 1;
            } else {
              currentNodeState.x = Math.random() > 0.5 ? 0 : 1;
            }

            currentNodeState.k = k + 1;

            const sendMessage = (port: number, data: any) => {
              fetch(`http://localhost:${BASE_NODE_PORT + port}/message`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
              });
            };

            for (let i = 0; i < N; i++) {
              sendMessage(i, {
                k: currentNodeState.k,
                x: currentNodeState.x,
                messageType: "propose",
              });
            }
          }
        }
      }
    }
    res.status(200).send("Message received and processed.");
    console.log(testcounter)

  });

  node.get("/start", async (req, res) => {
    // Wait until all nodes are ready
    while (!nodesAreReady()) {
      await delay(5); // Adding a brief pause to reduce CPU load
    }
    // If the node is non-faulty, it participates in the consensus
    if (!isFaulty) {
      currentNodeState.k = 1;
      currentNodeState.x = initialValue;
      currentNodeState.decided = false;
      // Broadcast the initial value to all nodes
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ k: currentNodeState.k, x: currentNodeState.x, messageType: "propose" }),
        });
      }
    }
    else {
      // Faulty nodes do not participate in the consensus process
      currentNodeState.decided = null;
      currentNodeState.x = null;
      currentNodeState.k = null;
    }
    res.status(200).send("Consensus algorithm started.");
  });





  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    let counter= 0;
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );
    console:console.log(initialValue)

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
