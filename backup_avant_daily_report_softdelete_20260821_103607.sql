/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.23-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: dolibarr
-- ------------------------------------------------------
-- Server version	10.6.23-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `llx_timeflow_daily_report`
--

DROP TABLE IF EXISTS `llx_timeflow_daily_report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `llx_timeflow_daily_report` (
  `rowid` int(11) NOT NULL AUTO_INCREMENT,
  `entity` int(11) NOT NULL DEFAULT 1,
  `fk_user` int(11) NOT NULL,
  `date_report` date NOT NULL,
  `content` text NOT NULL,
  `date_creation` datetime NOT NULL,
  `tms` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `fk_user_creat` int(11) NOT NULL,
  `fk_user_modif` int(11) DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `fk_user_read` int(11) DEFAULT NULL,
  PRIMARY KEY (`rowid`),
  KEY `idx_cdr_date` (`entity`,`date_report`),
  KEY `idx_cdr_user` (`entity`,`fk_user`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `llx_timeflow_daily_report`
--

LOCK TABLES `llx_timeflow_daily_report` WRITE;
/*!40000 ALTER TABLE `llx_timeflow_daily_report` DISABLE KEYS */;
INSERT INTO `llx_timeflow_daily_report` VALUES (2,1,7,'2026-08-12','abcdedfzfzff','2026-08-12 17:21:44','2026-08-12 15:35:24',7,7,'2026-08-12 17:35:24',1),(3,1,4,'2026-08-17','hey how u doin im fine thanks','2026-08-17 10:40:15','2026-08-17 08:41:11',4,4,NULL,NULL),(4,1,1,'2026-08-17','aaaaaaaaaaa','2026-08-17 11:18:23','2026-08-17 09:18:23',1,NULL,NULL,NULL),(5,1,1,'2026-08-17','Test rapport 1 - multiple per day','2026-08-17 10:41:54','2026-08-17 09:41:54',1,NULL,NULL,NULL),(6,1,1,'2026-08-17','Test rapport 2 - multiple per day','2026-08-17 10:41:54','2026-08-17 09:41:54',1,NULL,NULL,NULL),(7,1,1,'2026-08-17','aaaaaaaaaaa','2026-08-17 11:42:55','2026-08-17 09:42:55',1,NULL,NULL,NULL),(8,1,1,'2026-08-17','aaaaaa','2026-08-17 11:54:02','2026-08-17 09:54:02',1,NULL,NULL,NULL),(9,1,1,'2026-08-17','aaaaaaaaaaa','2026-08-17 12:22:57','2026-08-17 10:22:57',1,NULL,NULL,NULL),(10,1,1,'2026-08-17','aaaaaaaaaaaaaaaaa','2026-08-17 13:10:31','2026-08-17 11:10:31',1,NULL,NULL,NULL),(11,1,1,'2026-08-17','aaaaaabbbbbbbbbbbbbbbbb','2026-08-17 13:23:04','2026-08-17 13:03:39',1,1,NULL,NULL),(13,1,1,'2026-08-18','eeeeeeeeeeee','2026-08-18 12:15:16','2026-08-18 10:15:16',1,NULL,NULL,NULL),(14,1,2,'2026-08-19','aaaaaaaaaaaaaaaaa','2026-08-19 11:21:14','2026-08-19 09:21:14',2,NULL,NULL,NULL);
/*!40000 ALTER TABLE `llx_timeflow_daily_report` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-21 10:36:07
